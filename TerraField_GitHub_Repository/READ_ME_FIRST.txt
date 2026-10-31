TERRAFIELD — START HERE
=======================

This reconstructed source export DOES NOT include the original Windows Node
runtime, project LICENSE, hero image or offline GeoNames index. The replacement
hero is AI-generated. Project owner must confirm licensing before publication.

1. Install Node.js 24 LTS from https://nodejs.org/ . Node 20 is not sufficient.
2. Extract the ENTIRE project ZIP to a writable folder, such as Documents.
3. Double-click Start_TerraField.bat, or open a terminal in the folder and run:
       npm start
4. Open http://localhost:8000. Leave the terminal open. Stop with Ctrl+C.
   Windows batch execution was not tested in this environment.
5. Online place search, map imagery, live soil/weather require internet and
   may be unavailable; coordinates can be entered manually. Dated soil
   snapshots are estimates, not laboratory results.

Data stays in server/terra.db by default. Back up the database and browser
workspace key securely before upgrades. See docs/DEPLOYMENT_GUIDE.md for
Windows/VS Code setup, backup, restore and hosting steps.

TerraField is an unvalidated decision-support prototype, not agricultural
advice. Its crop indices are not probabilities or guarantees. Reports use a
browser-held bearer key, not a secure account system. Do not put real private
farmer data on a public instance without security and privacy review.

Tests: npm test currently has one failure because the offline GeoNames dataset
was not supplied. See docs/TESTING_REPORT.md and docs/KNOWN_LIMITATIONS.md.
