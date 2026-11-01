# Privacy

This describes what Scrap Riot's game server stores. It is a plain description of how the software works, written by the project, and is not legal advice. **Anyone running a public server should review it against the rules that apply to them**, particularly if children may play.

## What is stored

| Data | Why | Kept for |
| --- | --- | --- |
| Display name you choose | Shown to other players | Until you delete your account |
| Google account ID, if you sign in | Recognizes you next time | Until you delete your account |
| Money, gear, paint, rating and stats | Your progress | Until you delete your account |
| Match history | Your history and the leaderboard | Until you delete your account |
| Hashed session token | Keeps you signed in | 90 days |
| Guest accounts | Progress without signing in | Deleted after 60 days unused, or 7 days if no match was played |

## What is not stored

- **Your email address, real name and profile picture.** Google includes them in the sign-in credential. The server reads only the account ID and discards the rest.
- **Passwords.** There are none, because Google handles sign-in.
- **Connection logs.** Your IP address is held in memory while you are connected, to enforce connection limits, and is not saved.

## Who can see what

Your display name, paint, rating, wins, kills and match count are visible to other players. So is when you were last active, for up to a week, unless you never chose a name. Pick a name that doesn't identify you.

## Third parties

- **Google**, if you sign in. Its sign-in script loads only when you open the Profile tab.
- **GitHub Pages** hosts the game page, and **Cloudflare**, if the server uses a tunnel, carries game traffic. Each has its own privacy policy.

Your browser's local storage holds your session token and settings.

## Your choices

Play as a guest without giving anything to Google. Delete your account from the Profile tab at any time, which immediately removes your account, history and progress from the live database. Backups made by the server's operator may keep it until they expire.
