# zenonscraper database writer

The backend for zenonscraper responsible for handling read/write interactions between the ZNN JSON-RPC API and the PostgreSQL database. 

<br/>
<hr/>
<br/>

# Libraries
- Axios
- ws
- pg
- dotenv

# Getting Started

- ## Requirements
    - [NodeJs] (https://nodejs.org/en/) version 16+
    - NPM which can be found in the NodeJs installation
- ## Installation
    - cd into the znnscraper-db directory and run `npm install`
    - create your own .env file to manage database and ZNN JSON-RPC URLs
    - start local server using `npm start`
    - run dev server using `npm run dev`

- ## Project Structure
    - index.ts is the main file which is run
    - services/znn.ts is the ZNN JSON-RPC interface
    - services/db.ts is the database interface

# Current Deployment

The database server is currently being deployed using PM2.