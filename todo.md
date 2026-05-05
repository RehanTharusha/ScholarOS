# important note before moving forward with the next few tasks

everything needs to be stored in md files, jsons and csvs within courses folders. ofcourse while keeping things smooth, lean and token efficient. my main point if that i dont want to use some complex database system for storing data.

## a calendar component

I want to add a calendar component to my application that allows users to view and manage their events and appointments. The calendar should support features like adding, editing, and deleting events, as well as displaying them in a monthly, weekly, or daily view.

using the markdown and connections philosophy of the app, I can create a markdown file to keep track of the tasks and features I want to implement. This way, I can easily link to relevant resources, code snippets, and documentation as I work on integrating the pdf viewer and calendar component into my application. Also letting the agent create connections to the tasks that need to be done, therefore viewing a task i can back track to the resources and code snippets that are relevant to that task, making it easier to stay organized and efficient in my development process.

## rowboat has a feature called today.md

the current version of the implemented today.md feature is useless. redesign it to be more intune with the student requirements, like todays priorities can be upcoming assignments or tasks if have any

emails and what you missed are irrelevant here

i also think rowboats internal checks for these things run every 15 minutes, which we dont need to happen, we can have it run once every app launch and then have the user manually trigger it if they want to update the today.md file. this way we can save on resources and also give the user more control over when they want to see their priorities for the day.

we can completely remove the extremely crude dashboard thing we implemented before and just have the today.md file be the main focus for the user when they open the app. we can have it display their priorities for the day, any upcoming assignments or tasks, and maybe even a motivational quote or something to keep them motivated throughout the day.

## the kanban style assignment board

we have the kanban style assignment board already implemented. there is currently no way for me to add new blocks to the board. and also a drag and drop feature to move the blocks around. also remove the placeholder data in there.

## agent chatbox

the agent chat doenst autoscroll when the chats are being streamed to the user, this needs fixing. once pause if the user uses the scroll wheel to scroll up (which obviously they would do if they want to read previous messages) the autoscroll should pause, and then if they scroll back down to the bottom it should resume. this is a common feature in chat applications and it would make the user experience much better.

## remove emails and meetings features

the rowboat app had alot of meetings and emails integrations, this is not necesary for the student use case. start with removing the deeply integrated stuff and then the visual elements too.

##
