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
// const EVENTS = [
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

const EVENTS = [];
