# Stillroom — public Q&A library

A responsive question-and-answer site. Visitors can search, read, and copy questions and answers. The owner signs in to publish, edit, delete, or import entries. Answer text is kept verbatim: line breaks, indentation, tabs, and spaces are stored and copied as entered.

## Netlify architecture

- Frontend: static HTML, CSS, and JavaScript in `dist/`.
- API: Netlify Functions in `netlify/functions/`.
- Shared published Q&A: Netlify Blobs (`stillroom-library` store).
- Owner access: a Netlify environment password, signed 12-hour owner token, and rate-limited login. After signing in, the owner can change the password from the Owner desk; the new password is saved in Netlify Blobs and does not need a redeploy.
- Build: `npm run build`; no client framework or frontend build dependencies.

Published questions and answers are public. Do not publish passwords, private notes, or sensitive information.

## Deploy through GitHub and Netlify

Use a Git-connected Netlify site so Netlify builds both the static site and its Functions. This project must be deployed from the repository root; a static drag-and-drop deploy does not run the build or include the backend functions. See [Netlify's function deployment guide](https://docs.netlify.com/build/functions/get-started/).

### Put this project in GitHub

The local folder may not have Git history. To publish this project to `codes26-sketch/stillroom`:

1. Install and open **GitHub Desktop**, then sign in to GitHub.
2. Choose **File → Clone repository** and select `codes26-sketch/stillroom`.
3. In File Explorer, copy the contents of this project folder into the cloned repository folder. Replace files with the same names. Keep the directories `netlify/functions` and `scripts` in their current structure. Do not copy `.env`, `node_modules`, or `dist` if they exist.
4. In GitHub Desktop, review the changed files, enter a summary such as `Update Q&A site`, choose **Commit to main**, then **Push origin**.

### Connect the repository to Netlify

1. Sign in to Netlify and choose **Add new site → Import an existing project**.
2. Connect GitHub, select `codes26-sketch/stillroom`, and choose the `main` branch.
3. Confirm these build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Before publishing, open **Project configuration → Environment variables** and add:
   - `OWNER_PASSWORD`: the initial Owner desk password (set it to the password you requested). After first sign-in, changing it in the Owner desk saves a secure password hash to Netlify storage; future logins use the changed password.
   - `SESSION_SECRET`: a randomly generated value of at least 32 characters. Keep it private; never add it to GitHub.
   Set both variables to be available to **Functions**.
5. Save the variables and trigger a fresh deploy. Open the generated `*.netlify.app` address and use **Owner desk** to sign in.
6. Publish the site so visitors can open it. On new Netlify accounts, a project may start private until you publish it. Visitors can read and search without signing in.
7. Sign in to **Owner desk**, type a question and answer, and choose **Publish answer**. It is saved to shared Netlify storage immediately, so visitors can see it without uploading a file or redeploying.

Netlify Blobs persists the questions across new site deploys. Updates are strongly consistent in the API. The function stores the collection as one JSON value, with a 4 MB per-collection limit in this app. Netlify's current Free plan includes 300 monthly credits with a hard limit; the site pauses if the account reaches that limit, rather than automatically charging for extra usage. See [Netlify pricing](https://www.netlify.com/pricing/).

## Adding content

The Owner desk supports direct entry and imports up to 4 MB from CSV, JSON, and TXT. CSV should use `question,answer` headers. JSON may be a list of `{ "question": "…", "answer": "…" }` objects. Text uses `Question: ...`, then `Answer:` on its own line; put `---` on its own line between records. For code, JSON is best when preserving every character matters.

Visitors can copy the question, answer, or both. The answer display uses a monospaced preformatted area. Copy reads the original stored text, preserving whitespace regardless of search highlighting.

## Local preview

The static frontend can be served from the project folder. Without Netlify Functions, local preview displays a sample code answer. Owner sign-in and publishing require a Netlify deployment with the environment variables above.

To generate a session secret in PowerShell, run:

```powershell
$secretBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($secretBytes)
[void]$rng.Dispose()
[Convert]::ToBase64String($secretBytes)
```
