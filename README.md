# TrainingPeaks to Intervals.icu Syncer

Daily, authoritative synchronization of future TrainingPeaks calendar entries into
Intervals.icu. TrainingPeaks wins when a matching event differs.

## Behavior

- Syncs future, uncompleted TrainingPeaks workouts.
- Uses `external_id=tp:<workoutId>` for idempotent creates and updates.
- Adopts one uniquely matching untagged Intervals.icu event instead of duplicating it.
- Converts structured swim, bike, and run sessions to Intervals workout syntax.
- Converts TrainingPeaks notes to Intervals notes and Day Off entries to `Rest Day`.
- Reports source entries that disappeared but never deletes them automatically.
- Supports a no-write dry run.

## Configuration

Create one GitHub Actions repository secret named `TP_INTERVALS_SYNC_CONFIG`:

```json
{
  "trainingPeaks": {
    "username": "your-login",
    "password": "your-password"
  },
  "intervals": {
    "apiKey": "your-api-key",
    "athleteId": "i123456"
  },
  "sync": {
    "daysAhead": 90,
    "includeToday": false,
    "skipDates": [],
    "timeZone": "Asia/Jerusalem"
  }
}
```

The workflow runs at 05:00 Israel time. It is scheduled at both possible UTC hours
and skips the duplicate, so daylight-saving changes do not shift the local run time.
Manual runs default to dry-run.

## Local validation

```powershell
npm ci
npm run check
npm run sync -- --validate-export C:\path\to\trainingpeaks-export.json
```

To compare an export with the current Intervals.icu calendar without changing it:

```powershell
$env:TP_INTERVALS_SYNC_CONFIG = Get-Content -Raw .\local-config.json
npm run sync -- --export-json C:\path\to\trainingpeaks-export.json --dry-run
```

Run without `--dry-run` only after reviewing the generated create/update report.

## Authentication notes

The runner signs in through headless Chromium, then obtains the TrainingPeaks API token
from the authenticated browser session. Credentials and tokens are never logged or
written to disk. TrainingPeaks CAPTCHA or mandatory MFA can prevent unattended login;
test a manual dry run after configuring the secret.
