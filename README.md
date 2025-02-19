<div align="center">

![Header-1](https://github.com/user-attachments/assets/7faab35c-0f73-4bc5-a0a9-f193faf4a40c)
</div>

[![Badge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com)
[![Badge](https://forthebadge.com/images/badges/open-source.svg)](https://forthebadge.com)
[![Badge](https://forthebadge.com/images/badges/contains-tasty-spaghetti-code.svg)](https://forthebadge.com)

[![Badge](https://github.com/The-International-Screeps-Bot/The-International-Open-Source/actions/workflows/CD.yml/badge.svg?branch=Development)](https://github.com/The-International-Screeps-Bot/The-International-Open-Source/actions/workflows/CD.yml)

<a id="Contents"></a>
# Contents 
- [About](#About)
- [Progress and Design](#pd)
- [Requirements](#Requirements)
- [Usage](#Usage)
- [Contribution](#Contribution)
- [Support](#Support)

<a id="About"></a>
# About

The International is my bot for [Screeps](https://screeps.com/). Screeps is a massively multiplayer online strategy game where a player controls units and builds bases using Javascript. Screeps is a fun game where people often program their own bots from scratch. 

This bot can provide experienced and new players a reference for when they get stuck and need inspiration. Comments are used commonly, and code is structured so it can be easily understood, replicated, and expanded upon. That being said, there is much to improve.

This bot uses mainly Typescript and Javascript. 

### Bot Features 
- This bot is compatible with Windows, Linux, and Mac OS.
- Automated (can be manual via the console)
- Powerful economy
- Some combat code (quads and duos)
- Good defensive capabilities
- Automatically expand
- Communicates with specified players
- Destroys structures of certain types
- Keeps the statistics of the bot actions
- Adds colors and annotations to the map
- Organizes creeps automatically
- Manages the market 

If you have specific questions or want to discuss the bot, please join our discord server.

[![Discord link](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/5QubDsB786)

![image](https://github.com/The-International-Screeps-Bot/The-International-Open-Source/assets/48334001/961d8b2f-d63c-4ced-8a81-44c5e838f20a)
![map visuals](https://user-images.githubusercontent.com/48334001/232357947-7febd5e6-da7a-4f4f-b3fe-92bad7bb9005.png)
![Information panel](images/grafana.png)

<a id="pd"></a>
# Progress and Design

[Grafana board](http://pandascreeps.com)

[Videos](https://www.youtube.com/playlist?list=PLGlzrjCmziEj7hQZSwcmkXkMXgkQXUQ6C)

[MarvinTMB's screeps profile](https://screeps.com/a/#!/profile/MarvinTMB)

[Plans and bugs](https://github.com/The-International-Screeps-Bot/The-International-Open-Source/issues)

[Wiki](https://github.com/The-International-Screeps-Bot/The-International-Open-Source/wiki)

<a id="Requirements"></a>
# Requirements

Please read the about section before installing and using this bot.

First you'll want to download or fork the repository. Start by selecting a branch: Main is more stable but is often behind on features and improvements, while Development has more bugs, features and optimizations.

### NPM

Ensure you have downloaded [Node](https://nodejs.org/en/)

**Consider using Node version if 20.10.0 if you have issues**

You can check your node version with:

```powershell
node -v
```
If your node version is too recent, you can change it with NVM:

Linux/MacOS [nvm](https://github.com/nvm-sh/nvm)

Windows [nvm-windows](https://github.com/coreybutler/nvm-windows)

After making sure you have correct node version go to the project folder (not in src), you'll want to install the dependencies like so:

```powershell
npm i
```

And that's it. Join our [discord server](https://discord.gg/5QubDsB786) if you need help.

<a id="Usage"></a>
# Usage

### Considerations 
1. If you're a new player, especially one that wants to learn programming, this is not the place to start. I strongly encourage you to start your own bot and achieve a decent economy before using or contributing to this bot.
2. PLEASE DO NOT USE THIS BOT TO BULLY. Do not attack noobs, taking their remotes, or claimed rooms. If you find yourself against another open source bot, or a bot that can put up a fair fight against you, then best of luck. Please feel welcome to share experiences or ask questions in the [discord server](https://discord.gg/5QubDsB786).
3. Main is old but stable. Development is less stable, but more up to date. If you want to find bugs or test new features, Development is for you.

### Set-Up

Using [rollup](https://rollupjs.org/guide/en/) we will translate the code into a single js file, which will be used in environments set in `.screeps.yaml` file (see below if you don't have one yet). This compiles the code so it can be run by Screeps while we develop using folders and typescript.

1. Settings. `/src` -> `settings.example.ts` file. Copy the file and rename the clone to `settings.ts`. Change `settingsExample` definition to `settings`. Add your own preferences (including checks based on the name of the shard for server-specific settings).
2. Head to `src/other/userScript/userScript.example.ts` and follow the instructions at the top of the file. It will be very similar to settings up `settings.ts`.
3. Rename `.screeps.yaml.example` to `.screeps.yaml` and fill in the required information for each enviornment you want to run the bot in. For the official server, replace the `token` with an [API token](https://docs.screeps.com/auth-tokens.html) for your account. On private servers, edit _(or copy and rename)_ the `pserver` section with `host` set to your server domain or IP then complete `username` and `password` with your credentials on this server. For more information about this file, check the [screeps unified credentials file](https://github.com/screepers/screepers-standards/blob/master/SS3-Unified_Credentials_File.md) spec.
4. Running `rollup -c` will compile your code and do a "dry run", preparing the code for upload but not actually pushing it. Running `rollup -c --environment DEST:mmo` will compile your code, and then upload it to a screeps server using the `mmo` config from `.screeps.yaml`.
5. Use `-cw` instead of `-c` to automatically re-run when your source code changes - for example, `rollup -cw --environment DEST:main` will automatically upload your code to the `mmo` configuration every time your code is changed.
6. There are NPM scripts that serve as aliases for these commands in `package.json` for IDE integration. Running `npm run push-mmo` is equivalent to `rollup -c --environment DEST:mmo`, and `npm run watch-pserver` is equivalent to `rollup -cw --dest pserver`.

### Grafana
Use `https://pandascreeps.com` for Stats hosting
Grafana is a monitoring and visualization tool that is used to track the bot's performance and statistics. Some of the statistics that can be observed are
- CPU Usage
- Resource Management
- Creep Activity
- Room Status 

### Private Server Information
#### Important! To upload code to a private server, you must have [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth) installed and configured!

For more information, please go to the [wiki](https://github.com/CarsonBurke/The-International-Screeps-Bot/wiki/Usage)

To run the bot on an performance checking server, run `npm run server` and check out `localhost:21025` (server) and `localhost:3000` (grafana) in your browser. Alternatives with in-depth instructions can be found at [Using a Private Server](https://github.com/The-International-Screeps-Bot/The-International-Open-Source/wiki/Using-a-private-server)

For the performance server users, its always RoomName as email and password is `password`.

If you'd like to use rollup to compile to a private server, you'll need to download and configure [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth) to push your code.

I'd also suggest using this less-laggy tool [steamless-client](https://github.com/laverdet/screeps-steamless-client) to watch your private server run from the comfort of your browser.


### Advanced usage

If you want to run custom code without conflicting with the project's source - say, if you want to commit or make pull requests - it's recommended you use the userScript folder.

<a id="Contribution"></a>
# Contribution

### Guidelines 
**Please use the DEVELOPMENT branch for pull requests, commits, etc**
1. Please keep PRs focused - one feature or bug fix per PR
2. Follow existing code structure and formatting
3. Include comments to explain complex logic
4. Test changes before submitting

### Other information 
We're a huge fan of teamwork, and many useful features of this bot have been added by contributors.

If you want to join us in development for this bot, please join our [discord server](https://discord.gg/5QubDsB786) and share what you're working on, or hoping to add. We're happy to review issues, merge pull requests, and add collaborators!

An extra special thanks to Panda Master, Allorrian, Plaid Rabbit, Aerics, and DefaultO, SimplyAlex, shu for their essential contribution to this project.

<a id="Support"></a>
# Support

If you'd like to support the project, Carson Burke (AKA MarvinTMB) is happy to accept single time or monthly donations through the following links.

[Paypal](https://paypal.me/carsonburke22)

[Patreon](https://www.patreon.com/Marvin22)
