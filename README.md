# SAT Practice Platform (server version)

Real accounts, tests and results stored on the server – students, examinees and admins sign in from **any device**.
Includes the official Desmos calculator (floating window), the Bluebook-style reference sheet, modules, timers, flag / highlight, review page and per-module results.

## First run
    node server.js            # Node 18+ , then open http://localhost:3000
Created automatically on the first start (password **1** for all – change them in *Accounts → Edit*):
| role | ID |
|---|---|
| admin | `admin` |
| student | `s1` |
| examinee | `e1` |

and a sample test **Full Mock Test 1** (test password `1`): 2 modules per section, 4 questions per module.

## Put it online (needed so students can reach it)
This must run on a server that stays on. Options:
* **Render / Railway / Fly.io** – upload this folder (or push to GitHub). `render.yaml` and `Dockerfile` are included. Attach a **persistent disk** mounted at `/data` and set `DATA_DIR=/data`; otherwise your data is erased on every deploy.
* **Any VPS with Docker:** `docker build -t sat . && docker run -d -p 80:3000 -v sat-data:/data sat`
* Always use **HTTPS** (all the hosts above give you one) – passwords are sent when people sign in.
Back up `data.json` regularly (it holds everything).

## Desmos
`index.html` loads the real Desmos graphing calculator using Desmos' public **demo** key. Desmos asks every production site to use its own key: request a free one at https://www.desmos.com/api and replace `apiKey=...` in the `<script>` line at the top of `index.html`.

## Notes
* Passwords are stored hashed (scrypt); test answers never reach students' browsers – grading is done on the server.
* 10 wrong sign-ins from one address lock sign-in for 10 minutes.
* Screenshot / tab-switch protection in a browser is a deterrent only.
