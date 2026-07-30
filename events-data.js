// One entry per event/gathering. To add a new one:
//   1. Drop the finished montage mp3 into montages/
//      (naming convention: YYYY-MM-DD-location-slug.mp3).
//   2. Drop each portrait into portraits/ (any reasonable image size/format
//      -- these are just displayed as small thumbnails).
//   3. Add an entry below. `date` must be YYYY-MM-DD so entries sort
//      correctly (oldest first, matching the numbered list on montages.html).
//      `slug` becomes that event's URL: /events/<slug>.
//   4. Commit and push -- Netlify deploys automatically.
//
// IMPORTANT: local file paths (audio/photo/recording) must start with a
// leading `/` (e.g. "/montages/foo.mp3", not "montages/foo.mp3"). event.html
// is reached at /events/<slug> via a Netlify rewrite that keeps that URL in
// the address bar while actually serving /event.html -- a relative path
// resolves against whatever's in the address bar, not the file's real
// location, so a non-absolute path silently 404s only in production, not
// when testing event.html directly. Absolute paths work in both.
//
// Example:
// window.EVENTS = [
//   {
//     slug: "atlanta-care-event-2026-08-25",
//     title: "Economies of Care Dinner — Atlanta, GA",
//     date: "2026-08-25",
//     location: "Atlanta, GA",
//     audio: "/montages/2026-08-25-atlanta.mp3",
//     // Optional. Plain text, blank lines become paragraph breaks. This is
//     // the "admin" mechanism for adding event context after the fact --
//     // an organizer emails you who organized/sponsored/what the night was
//     // like, you paste it in here, commit, push. Nothing fancier than that.
//     description: "Organized by the Atlanta Care Collective, hosted at...\n\nSponsored by...",
//     portraits: [
//       {
//         name: "Jane D.",
//         photo: "/portraits/2026-08-25-atlanta-jane-d.jpg",
//         // Both optional. For a real event these are just that person's
//         // Drive Link / Transcript Link, already sitting in the Sheet from
//         // their submission -- copy them over by hand. These two are full
//         // Drive URLs already, not local paths, so no leading-slash concern.
//         recording: "https://drive.google.com/file/d/.../view",
//         transcript: "https://docs.google.com/document/d/.../edit",
//       },
//       { name: "Marcus T.", photo: "/portraits/2026-08-25-atlanta-marcus-t.jpg" },
//     ],
//   },
// ];
//
// NOTE: this must be `window.EVENTS =`, not `const EVENTS =` -- a top-level
// const/let in a plain <script> doesn't attach to `window`, which is what
// montages.js/event.js actually read.

window.EVENTS = [
  {
    slug: "demo-event",
    title: "Demo Event — Beta Preview",
    date: "2026-07-24",
    location: "Placeholder / beta demo",
    audio: "/montages/2026-demo-beta-preview.mp3",
    description: "This is placeholder text standing in for what a real event description will look like -- organizer, sponsor, and a bit about the evening, sent in after the fact and pasted in here by hand.\n\nFor a real gathering: who organized the table, who (if anyone) sponsored it, and a couple sentences about how the night went, in the organizer's own words where possible.",
    portraits: [
      // Individual "Listen" links point at a short highlight clip, not
      // these placeholder people's full (much longer than a real 2-minute
      // submission) source recordings -- see voices/README.md. No
      // "Transcript" links here since these never went through the real
      // transcription pipeline (that only runs on actual site submissions).
      { name: "Darla Roach", photo: "/portraits/head1.jpg", recording: "/voices/darla-roach.mp3" },
      { name: "Dorothy", photo: "/portraits/dorothy.jpg", recording: "/voices/dorothy.mp3" },
      { name: "Sean", photo: "/portraits/head3.jpg", recording: "/voices/sean.mp3" },
      { name: "Judith", photo: "/portraits/head4.jpg", recording: "/voices/judith.mp3" },
      { name: "Malcom Davis", photo: "/portraits/head5.jpg", recording: "/voices/malcom-davis.mp3" },
      { name: "Jenn", photo: "/portraits/head6.jpg", recording: "/voices/jenn.mp3" },
      { name: "Karen Rizollo", photo: "/portraits/head7.jpg", recording: "/voices/karen-rizollo.mp3" },
      { name: "Letti", photo: "/portraits/head8.jpg", recording: "/voices/letti.mp3" },
      { name: "Anonymous", photo: "/portraits/head9.jpg", recording: "/voices/anonymous.mp3" },
      { name: "Carroll", photo: "/portraits/carroll.jpg", recording: "/voices/carroll.mp3" },
    ],
  },
  {
    slug: "story-beta-test",
    title: "Story Beta Test",
    date: "2026-07-30",
    location: "Multiple locations",
    audio: "/montages/story-beta-test.mp3",
    description: "The first real test of the story recorder, open to anyone willing to try it before a wider launch. Six people recorded or uploaded a story over a few days in late July 2026, from Williamsburg, VA to Bellingham, WA to Santa Fe, NM. Thank you to everyone who took the time to share.",
    portraits: [
      {
        name: "Patricia Liehr",
        photo: "/portraits/patricia-liehr.jpg",
        recording: "https://drive.google.com/file/d/1JhLJKWaN9U2o1sppSt4soXRmpPhCyNF6/view?usp=drivesdk",
        transcript: "https://docs.google.com/document/d/1JhrvzpGjy0mo3QhwANIBqHc8TNKPhBJX/edit?usp=drivesdk&ouid=112378949695401561938&rtpof=true&sd=true",
      },
      {
        name: "Monica Koller",
        photo: "/portraits/monica-koller.jpg",
        recording: "https://drive.google.com/file/d/1OOjjaa3gLwaEvkODrUt58x7utELF568x/view?usp=drivesdk",
      },
      {
        name: "Jode",
        photo: "/portraits/jode.jpg",
        recording: "https://drive.google.com/file/d/1887e1TqH9neY6D86I1qTQo3xDeDwjMP3/view?usp=drivesdk",
      },
      {
        name: "Jamie D.",
        photo: "/portraits/jamie-d.jpg",
        recording: "https://drive.google.com/file/d/10Hwi6899JQB0vlBxg9wWVXFWbBmuW9Mq/view?usp=drivesdk",
      },
      {
        name: "Pat",
        photo: "/portraits/placeholder-generic.svg",
        recording: "https://drive.google.com/file/d/1TYm9T3HSU0Pe6pSX9jiPJLBlOZ2Vaoya/view?usp=drivesdk",
      },
      {
        name: "Pat",
        photo: "/portraits/placeholder-generic.svg",
        recording: "https://drive.google.com/file/d/1dlD84GdS5i5R44ipT6O6K0DU-10tTKVo/view?usp=drivesdk",
      },
    ],
  },
];
