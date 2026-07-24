# Portrait files

Headshot/portrait images shown on each event's page, as plain image files
(jpg/png/webp), served as static assets by Netlify. Naming convention:
`YYYY-MM-DD-location-firstname-lastinitial.jpg`, matching the montage
file's date/location prefix.

To add one: drop the image here, then reference it in the matching event's
`portraits` array in `../events-data.js`. Commit and push to deploy.
