# important note before moving forward with the next few tasks

everything needs to be stored in md files, jsons and csvs within courses folders. ofcourse while keeping things smooth, lean and token efficient. my main point if that i dont want to use some complex database system for storing data.

## a calendar component

I want to add a calendar component to my application that allows users to view and manage their events and appointments. The calendar should support features like adding, editing, and deleting events, as well as displaying them in a monthly, weekly, or daily view.

using the markdown and connections philosophy of the app, I can create a markdown file to keep track of the tasks and features I want to implement. This way, I can easily link to relevant resources, code snippets, and documentation as I work on integrating the pdf viewer and calendar component into my application. Also letting the agent create connections to the tasks that need to be done, therefore viewing a task i can back track to the resources and code snippets that are relevant to that task, making it easier to stay organized and efficient in my development process.

## move the raw folder

move the raw folder from the root folder to inside the knowledge folder such that it is viewable in the app. i want to change the ingest instructions to simply read the raw folder, and raw folder only to determine that new files have been added and need to be ingested. the agent can then organize those raw files within the raw folder to folders based on subject.

## rowboat has a feature called today.md

the current version of the implemented today.md feature is useless. redesign it to be more intune with the student requirements, like todays priorities can be upcoming assignments or tasks if have any

emails and what you missed are irrelevant here

i also think rowboats internal checks for these things run every 15 minutes, which we dont need to happen, we can have it run once every app launch and then have the user manually trigger it if they want to update the today.md file. this way we can save on resources and also give the user more control over when they want to see their priorities for the day.

we can completely remove the extremely crude dashboard thing we implemented before and just have the today.md file be the main focus for the user when they open the app. we can have it display their priorities for the day, any upcoming assignments or tasks, and maybe even a motivational quote or something to keep them motivated throughout the day.

## the kanban style assignment board

we have the kanban style assignment board already implemented. there is currently no way for me to add new blocks to the board. and also a drag and drop feature to move the blocks around. also remove the placeholder data in there.

## agent chatbox

the agent chat doenst autoscroll when the chats are being streamed to the user, this needs fixing.

## remove emails and meetings features

the rowboat app had alot of meetings and emails integrations, this is not necesary for the student use case. start with removing the deeply integrated stuff and then the visual elements too.

## pdf parser issue encountered during ingestion on a exported build of the app

Two separate PDF parsing tools encountered distinct issues during ingestion:

Local PDF Parser (parseFile) Issues
This tool uses pdf.js under the hood for local text extraction without sending files to external services. Every parseFile call failed with this identical error:

Setting up fake worker failed: "Cannot find module 'F:\Programming Projects\ScholarOS\apps\x\apps\main\out\make\zip\win32\x64\Rowboat-win32-x64-0.1.0\resources\app\.package\dist\pdf.worker.mjs' imported from F:\Programming Projects\ScholarOS\apps\x\apps\main\out\make\zip\win32\x64\Rowboat-win32-x64-0.1.0\resources\app\.package\dist\main.cjs"
Root cause: The ScholarOS Windows build (Rowboat-win32-x64-0.1.0) is missing the pdf.worker.mjs file required by pdf.js, or the worker file is packaged in an incorrect path. When parseFile tries to initialize pdf.js, it cannot locate the worker, so it fails to set up the parsing environment. This affects all local PDF extraction regardless of file size or content.

LLM-Based Parser (LLMParse) Issues
This tool sends PDFs as multimodal attachments to your configured LLM to extract structured markdown. Two types of failures occurred:

Provider errors: For Chapter 01 The roles of the finance function in organizations.pdf and Chapter 02 The activities performed by finance professionals to fulfil the roles.pdf, the tool returned:

{"success":false,"error":"Provider returned error"}
This indicates the LLM service rejected the request. Common causes include an expired/invalid API key, rate limit exceeded, temporary LLM provider outage, or the PDF exceeding the LLM's file size limit for multimodal inputs.
Filename typo: The attempt to parse the E1 Stakeholders tutorial failed with an ENOENT (file not found) error because we omitted the "E1A" prefix from the actual filename (E1A Tutorial 1 - Stakeholders Corporate social Responsibility.pdf). This was a human error, not a parser bug.
