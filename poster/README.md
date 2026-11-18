# FitWork poster (A1, 594 x 841 mm)

- `poster.html` — the poster source (HTML/CSS + a small script that draws the "meaning-space" chart and score ring).
- `qr_site.svg` — QR code to https://fitwork-zain2026.web.app (made with `segno`).
- Output in the project root: `FitWork_Poster.png` (4490 x 6358 px, ~190 dpi at A1) and `FitWork_Poster.pdf` (A1 page, same image).

All numbers on the poster are measured results from `TEST_RESULTS.md`. The match card and the scores in the
chart are an illustration of the interface, not a real user's data.

## Re-render after editing (PowerShell)
Chromium is the one installed by Playwright. The output path must not contain spaces.
```powershell
$chrome = "$env:LOCALAPPDATA\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
$url = "file:///C:/Users/PSBA/Desktop/FYP%20project/poster/poster.html"
Start-Process $chrome -ArgumentList @('--headless=new','--hide-scrollbars','--force-device-scale-factor=2',
  '--window-size=2245,3179','--virtual-time-budget=8000',"--screenshot=$env:TEMP\FitWork_Poster.png",$url) -Wait
```
Then wrap the PNG in an A1 PDF (Chromium's own print-to-PDF draws thin boxes around the gradient text).
