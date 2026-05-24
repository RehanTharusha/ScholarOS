# YouTube Video Link Finder — Workflow Guide

Use this workflow when you need to find real, working YouTube video links for a list of topics (e.g., fixing broken links in video supplement files).

## The Problem

Video supplement `.md` files often end up with placeholder or duplicate YouTube video IDs — the same `watch?v=XXXXX` copy-pasted across unrelated topics, or links to videos that no longer exist. You need to find **real, topic-specific** videos.

## The Approach

YouTube search results don't render useful content in the browser tool (all JavaScript). `yt-dlp` is usually not installed. The reliable method is using **PowerShell + `Invoke-WebRequest`** to scrape video IDs from YouTube search result pages.

## Step-by-Step

### 1. Build a topic list

Create an array of search queries and labels. Each query should include the channel name (e.g., "Khan Academy", "ACDC Leadership", "tutor2u") plus the specific topic:

```
@{Query="ACDC Leadership production possibilities curve microeconomics"; Label="PPC"}
@{Query="Khan Academy law of demand"; Label="Law of Demand"}
@{Query="tutor2u Mintzberg managerial roles"; Label="Mintzberg"}
```

### 2. Run the batch search script

Save a `.ps1` file in the workspace root and execute it:

```powershell
# fetch_yt_videos.ps1
$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }

$topics = @(
    @{Query="ACDC Leadership production possibilities curve"; Label="PPC"},
    @{Query="Khan Academy law of demand"; Label="Law of Demand"}
    # ... add all topics
)

foreach ($topic in $topics) {
    $url = "https://www.youtube.com/results?search_query=$($topic.Query)&sp=EgIQAQ%3D%3D"
    try {
        $content = (Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing).Content
        $matches = Select-String -InputObject $content -Pattern 'watch\?v=[a-zA-Z0-9_-]{11}' -AllMatches |
            ForEach-Object { $_.Matches.Value } |
            Select-Object -First 3 -Unique
        Write-Host "$($topic.Label): $($matches -join ', ')"
    } catch {
        Write-Host "$($topic.Label): ERROR"
    }
    Start-Sleep -Milliseconds 500
}
```

Run it with:
```
powershell -ExecutionPolicy Bypass -File "D:\LJMU BBA\fetch_yt_videos.ps1"
```

The `&sp=EgIQAQ%3D%3D` filter restricts results to videos only (no playlists/channels).

### 3. Handle empty results

Some niche topics return no results. Try broader queries:
- Remove the channel name: `"omnificent symbolic view management"` instead of `"tutor2u omnificent symbolic view"`
- Use alternative keywords: `"strong weak organizational culture"` instead of `"strong vs weak cultures"`

### 4. Verify critical videos in the browser

Spot-check 3-5 videos by navigating to them:
```
browser-control action=navigate target=https://www.youtube.com/watch?v=VIDEO_ID
```
Check the page title matches the expected topic. The browser tool shows the video title in its response.

### 5. Write the corrected `.md` files

Use `workspace-writeFile` to replace the entire file with corrected links. Keep the existing layout (tables, headers, playlists) — only swap the video IDs.

### 6. Clean up

Remove the temporary `.ps1` script:
```
workspace-remove path=fetch_yt_videos.ps1
```

## Key Tips

- **Always include the channel name** in the query for better accuracy (e.g., "Khan Academy" + topic)
- **Use `Select-Object -First 3 -Unique`** to get up to 3 unique video IDs per topic (first is usually the best match)
- **Add `Start-Sleep -Milliseconds 500`** between requests to avoid rate limiting
- **The regex `watch\?v=[a-zA-Z0-9_-]{11}`** matches standard YouTube video IDs (exactly 11 characters)
- **Playlist links** (`/playlist?list=...`) are found the same way but use a different URL pattern — search for `playlist?list=` instead
- **Some topics won't have dedicated videos** — use the closest related video or a broader overview video

## Known Reliable Channels (Microeconomics & Management)

| Channel | Handle | Best For |
|---------|--------|----------|
| ACDC Leadership | @JacobAClifford | Energetic exam-focused micro/macro review |
| Khan Academy | @khanacademy | Structured, in-depth lessons |
| tutor2u | @tutor2u-official | A-Level/IB business & economics |
| CrashCourse | @crashcourse | Big-picture context, entertaining |
| EconClips | @EconClips | Short animated micro explainers |
| EPM | @epm8805 | Management & business concepts |
| Economicsfun | @economicsfun | Niche economics topics (Giffen goods, etc.) |

## Example Output Format

The script outputs `Label: watch?v=XXXXX, watch?v=YYYYY` per line. Map these back to your table rows:

```
PPC: watch?v=FwPiWz1a1Tw
Law of Demand: watch?v=ShzPtU7IOXs
Mintzberg: watch?v=bJe4YWdGzzM
```

Then construct full URLs: `https://www.youtube.com/watch?v=FwPiWz1a1Tw`
