(function(){
  // Netlify Functions cap synchronous request bodies at ~6MB. Base64 adds ~33%
  // overhead, so we cap the raw recording well below that to leave headroom
  // for the JSON wrapper. A 2-minute voice recording is normally 0.5-2MB.
  const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB raw -> ~5.3MB base64

  let mediaRecorder, chunks = [], stream, timerInterval, seconds = 0;
  let recordedBlob = null;
  let submitting = false;

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

  recBtn.addEventListener('click', async () => {
    if (submitting) return;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }catch(err){
      setHint('Microphone access was blocked — check your browser settings.', true);
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting || !recordedBlob || !consent.checked) return;

    submitting = true;
    updateSubmitState();
    setStatus('Uploading your story…', 'info');

    try {
      const audioBase64 = await blobToBase64(recordedBlob);
      const response = await fetch('/.netlify/functions/submit-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: recordedBlob.type || 'audio/webm',
          name: nameInput.value.trim(),
          city: cityInput.value.trim(),
          consent: consent.checked,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        let message = 'Something went wrong submitting your story. Please try again.';
        try {
          const data = await response.json();
          if (data && data.error) message = data.error;
        } catch (_) { /* ignore non-JSON error body */ }
        throw new Error(message);
      }

      setStatus('', null);
      form.style.display = 'none';
      document.querySelector('.lyst-wrap .recorder').style.display = 'none';
      document.querySelector('.lyst-wrap .card').style.display = 'none';
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
