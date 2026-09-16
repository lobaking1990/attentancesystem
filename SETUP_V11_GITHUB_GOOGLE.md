# Pemulihan Attendance v11 — GitHub HTTPS + Google Sheets

## Architecture
GitHub Pages (HTTPS + QR camera) → Google Apps Script bridge → Google Sheets.

The GitHub page does **not** contain the Google Sync Key. Each trusted device stores the Apps Script `/exec` URL and Sync Key in its own browser local storage.

## A. Update Google Apps Script
1. Open the existing Pemulihan Apps Script project.
2. Replace `Code.gs` with the v11 Google Apps Script bridge code supplied for this system.
3. Save.
4. Run `setupPemulihan()` once and approve permissions.
5. Open the execution log and copy the line starting with `SYNC KEY`.
6. Deploy → **Manage deployments** → Edit → **New version** → Deploy.
7. Deployment type: **Web app**.
8. **Execute as:** Me.
9. **Who has access:** Anyone.
10. Copy the Web App URL ending in `/exec`.

If you lose the Sync Key, run `showPemulihanSetupInfo()` and check the log. If you think the key was exposed, run `rotatePemulihanSyncKey()` and update every trusted device.

## B. Open GitHub Pages
Open:

`https://lobaking1990.github.io/attentancesystem/`

GitHub Pages provides HTTPS for the camera-based QR scanner.

## C. Connect each trusted device once
1. Unlock the attendance system.
2. Open **Cloud Sync**.
3. Paste the Google Apps Script `/exec` URL.
4. Paste the Sync Key.
5. Press **Simpan Sambungan**.
6. Press **Uji Cloud**.
7. When the test succeeds, use **Cloud → Device** if Google Sheets has the correct master data, or **Device → Cloud** if this device has the correct master data.

## Security
- Do not commit the Sync Key to GitHub.
- The Sync Key is stored only in the browser of each trusted device.
- The Apps Script bridge accepts only the GitHub Pages origin and requires the long Sync Key.
- The Teacher PIN remains a user-interface lock; it is not the cloud API secret.

## QR compatibility
Existing QR payloads remain unchanged: `PEMULIHAN|student_id`. Existing printed pupil QR cards can continue to be used.
