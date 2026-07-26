(function(){
  // Netlify Functions cap synchronous request bodies at ~6MB. Base64 adds ~33%
  // overhead, so we cap the raw recording well below that to leave headroom
  // for the JSON wrapper. A 2-minute voice recording is normally 0.5-2MB.
  const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB raw -> ~5.3MB base64

  // A portrait rides in the same request as the audio, and Netlify caps a
  // synchronous function's whole request body around 6MB -- audio alone can
  // already use ~5.3MB of that. So instead of a size cap on the original
  // photo (which could be several MB straight off a phone), it's always
  // compressed down to a small thumbnail client-side first. Good enough for
  // a name-card-sized headshot, comfortably small regardless of source.
  const PORTRAIT_MAX_DIMENSION = 480;
  const PORTRAIT_TARGET_BYTES = 220 * 1024;
  const PORTRAIT_HARD_CAP_BYTES = 400 * 1024;

  const MIC_BLOCKED_MESSAGE = 'Microphone access is blocked. Click the 🔒 lock icon next to the address bar, allow the microphone, then reload this page.';

  let mediaRecorder, chunks = [], stream, timerInterval, seconds = 0;
  let recordedBlob = null;
  let portraitBlob = null;
  let submitting = false;
  // First tap only asks for microphone permission (doesn't record yet) --
  // separating "grant access" from "start talking" so the browser's native
  // permission prompt shows up in a clearly-labeled, low-stakes moment
  // instead of feeling like an unexpected interruption right as someone
  // starts trying to tell their story. People are less likely to reflexively
  // hit "Block" on something they were told to expect.
  let micPrimed = false;

  const recBtn = document.getElementById('lystRecBtn');
  const ringStage = document.getElementById('lystRingStage');
  const timerEl = document.getElementById('lystTimer');
  const hint = document.getElementById('lystHint');
  const playback = document.getElementById('lystPlayback');
  const submitBtn = document.getElementById('lystSubmitBtn');
  const submitStatus = document.getElementById('lystSubmitStatus');
  const consent = document.getElementById('lystConsent');
  const nameInput = document.getElementById('lystName');
  const cityInput = document.getElementById('lystCity');
  const eventInput = document.getElementById('lystEvent');
  const portraitInput = document.getElementById('lystPortrait');
  const portraitHint = document.getElementById('lystPortraitHint');
  const portraitPreview = document.getElementById('lystPortraitPreview');
  const form = document.getElementById('lystForm');
  const thankyou = document.getElementById('lystThankyou');

  function formatTime(s){
    const m = Math.floor(s/60);
    const r = s%60;
    return m + ':' + String(r).padStart(2,'0');
  }

  function setHint(text, isError){
    hint.textContent = text;
    hint.classList.toggle('error', !!isError);
  }

  function setStatus(text, kind){
    submitStatus.textContent = text || '';
    submitStatus.classList.remove('info', 'error');
    if (text) {
      submitStatus.classList.add('show', kind || 'info');
    } else {
      submitStatus.classList.remove('show');
    }
  }

  function updateSubmitState(){
    submitBtn.disabled = submitting || !(recordedBlob && consent.checked);
  }
  consent.addEventListener('change', updateSubmitState);

  async function primeMic(){
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Only needed the permission grant, not an open mic right now --
      // release the hardware immediately so there's no lingering
      // recording indicator before they've actually chosen to record.
      testStream.getTracks().forEach(t => t.stop());
      micPrimed = true;
      setHint('Tap to start recording — up to 2 minutes', false);
      recBtn.setAttribute('aria-label', 'Start recording');
    } catch (err) {
      setHint(MIC_BLOCKED_MESSAGE, true);
    }
  }

  // Returning visitors may already have a decision on record for this site;
  // check upfront so they're not asked to "get ready" if we already know
  // the answer. Safari doesn't support querying 'microphone' this way, so
  // this degrades gracefully to the normal two-tap flow when unsupported.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then((status) => {
      if (status.state === 'granted') {
        micPrimed = true;
        setHint('Tap to start recording — up to 2 minutes', false);
        recBtn.setAttribute('aria-label', 'Start recording');
      } else if (status.state === 'denied') {
        setHint(MIC_BLOCKED_MESSAGE, true);
      }
    }).catch(() => { /* unsupported query name -- fall back to the tap-to-prime flow */ });
  }

  recBtn.addEventListener('click', async () => {
    if (submitting) return;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (!micPrimed) {
      await primeMic();
      return; // this tap only requested permission; the next one records
    }
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }catch(err){
      setHint(MIC_BLOCKED_MESSAGE, true);
      return;
    }
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      ringStage.classList.remove('active');
      recBtn.classList.remove('recording');
      clearInterval(timerInterval);

      if (blob.size > MAX_AUDIO_BYTES) {
        recordedBlob = null;
        playback.style.display = 'none';
        setHint('That recording is too long to upload — please try a shorter take.', true);
        updateSubmitState();
        return;
      }

      recordedBlob = blob;
      playback.src = URL.createObjectURL(blob);
      playback.style.display = 'block';
      setHint('Recorded — listen back, or tap to record again.', false);
      updateSubmitState();
    };
    mediaRecorder.start();
    seconds = 0;
    timerEl.textContent = '0:00';
    ringStage.classList.add('active');
    recBtn.classList.add('recording');
    setHint('Recording — tap again to stop.', false);
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = formatTime(seconds);
      if (seconds >= 120) mediaRecorder.stop();
    }, 1000);
  });

  function blobToBase64(blob){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result is "data:<mime>;base64,<data>" — strip the prefix.
        const result = reader.result;
        const commaIndex = result.indexOf(',');
        resolve(result.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function compressPortrait(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width >= height && width > PORTRAIT_MAX_DIMENSION) {
          height = Math.round(height * (PORTRAIT_MAX_DIMENSION / width));
          width = PORTRAIT_MAX_DIMENSION;
        } else if (height > width && height > PORTRAIT_MAX_DIMENSION) {
          width = Math.round(width * (PORTRAIT_MAX_DIMENSION / height));
          height = PORTRAIT_MAX_DIMENSION;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        // Try progressively lower quality until it's comfortably small --
        // a single fixed quality can still come out large for a busy/
        // high-detail photo.
        const qualities = [0.8, 0.6, 0.4];
        const tryQuality = (i) => {
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('Could not process that photo.')); return; }
            if (blob.size <= PORTRAIT_TARGET_BYTES || i === qualities.length - 1) {
              if (blob.size > PORTRAIT_HARD_CAP_BYTES) {
                reject(new Error('That photo is too large even after compression — try a simpler image.'));
              } else {
                resolve(blob);
              }
            } else {
              tryQuality(i + 1);
            }
          }, 'image/jpeg', qualities[i]);
        };
        tryQuality(0);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that photo — try a JPG or PNG.'));
      };
      img.src = url;
    });
  }

  portraitInput.addEventListener('change', async () => {
    const file = portraitInput.files[0];
    portraitHint.textContent = '';
    if (!file) {
      portraitBlob = null;
      portraitPreview.style.display = 'none';
      return;
    }
    try {
      portraitBlob = await compressPortrait(file);
      portraitPreview.src = URL.createObjectURL(portraitBlob);
      portraitPreview.style.display = 'block';
    } catch (err) {
      portraitBlob = null;
      portraitPreview.style.display = 'none';
      portraitHint.textContent = err.message || 'Could not use that photo.';
      portraitHint.classList.add('error');
      portraitInput.value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting || !recordedBlob || !consent.checked) return;

    submitting = true;
    updateSubmitState();
    setStatus('Uploading your story…', 'info');

    try {
      const audioBase64 = await blobToBase64(recordedBlob);
      const payload = {
        audioBase64,
        mimeType: recordedBlob.type || 'audio/webm',
        name: nameInput.value.trim(),
        city: cityInput.value.trim(),
        eventName: eventInput.value.trim(),
        consent: consent.checked,
        timestamp: new Date().toISOString()
      };
      if (portraitBlob) {
        payload.portraitBase64 = await blobToBase64(portraitBlob);
        payload.portraitMimeType = portraitBlob.type || 'image/jpeg';
      }

      const response = await fetch('/.netlify/functions/submit-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data = null;
      try { data = await response.json(); } catch (_) { /* ignore non-JSON body */ }

      if (!response.ok) {
        throw new Error((data && data.error) || 'Something went wrong submitting your story. Please try again.');
      }

      setStatus('', null);
      form.style.display = 'none';
      document.querySelector('.lyst-wrap .recorder').style.display = 'none';
      document.querySelector('.lyst-wrap .card').style.display = 'none';
      // The photo is a bonus, not the core submission -- if it failed to
      // upload, the story itself still saved fine, so this still counts as
      // success. Just let them know the photo didn't make it.
      const thankyouSub = thankyou.querySelector('span');
      if (data && data.photoWarning && thankyouSub) {
        thankyouSub.textContent = data.photoWarning;
      }
      thankyou.classList.add('show');
    } catch (err) {
      submitting = false;
      updateSubmitState();
      setStatus(err.message || 'Something went wrong submitting your story. Please try again.', 'error');
    }
  });

  // When embedded in an iframe (e.g. a Squarespace code block), tell the
  // parent page our content height so it can size the iframe to match
  // instead of showing a fixed-height scrollbar.
  if (window.parent !== window) {
    const sendHeight = () => {
      window.parent.postMessage(
        { type: 'horizons-embed-resize', height: document.documentElement.scrollHeight },
        '*'
      );
    };
    new ResizeObserver(sendHeight).observe(document.documentElement);
    window.addEventListener('load', sendHeight);
  }
})();
