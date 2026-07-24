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
// Example:
// window.EVENTS = [
//   {
//     slug: "atlanta-care-event-2026-08-25",
//     title: "Economies of Care Dinner — Atlanta, GA",
//     date: "2026-08-25",
//     location: "Atlanta, GA",
//     audio: "montages/2026-08-25-atlanta.mp3",
//     portraits: [
//       { name: "Jane D.", photo: "portraits/2026-08-25-atlanta-jane-d.jpg" },
//       { name: "Marcus T.", photo: "portraits/2026-08-25-atlanta-marcus-t.jpg" },
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
    audio: "montages/2026-demo-beta-preview.mp3",
    portraits: [
      { name: "Darla Roach", photo: "portraits/head1.jpg" },
      { name: "Judith", photo: "portraits/head2.jpg" },
      { name: "Jenn", photo: "portraits/head3.jpg" },
      { name: "John Bercier", photo: "portraits/head4.jpg" },
      { name: "Sean", photo: "portraits/head5.jpg" },
      { name: "Anonymous", photo: "portraits/head6.jpg" },
      { name: "Lopez", photo: "portraits/head7.jpg" },
      { name: "Malcom Davis", photo: "portraits/head8.jpg" },
      { name: "Karen Rizollo", photo: "portraits/head9.jpg" },
      { name: "Letti", photo: "portraits/head10.jpg" },
    ],
  },
];
