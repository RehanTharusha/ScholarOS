# important note before moving forward with the next few tasks

everything needs to be stored in md files, jsons and csvs within courses folders. ofcourse while keeping things smooth, lean and token efficient. my main point if that i dont want to use some complex database system for storing data.

## rowboat has a feature called today.md

the current version of the implemented today.md feature is useless. redesign it to be more intune with the student requirements, like todays priorities can be upcoming assignments or tasks if have any

emails and what you missed are irrelevant here

i also think rowboats internal checks for these things run every 15 minutes, which we dont need to happen, we can have it run once every app launch and then have the user manually trigger it if they want to update the today.md file. this way we can save on resources and also give the user more control over when they want to see their priorities for the day.

we can completely remove the extremely crude dashboard thing we implemented before and just have the today.md file be the main focus for the user when they open the app. we can have it display their priorities for the day, any upcoming assignments or tasks, and maybe even a motivational quote or something to keep them motivated throughout the day.

## the kanban style assignment board

we have the kanban style assignment board already implemented. there is currently no way for me to add new blocks to the board. and also a drag and drop feature to move the blocks around. also remove the placeholder data in there.

## agent chatbox

the agent chat doenst autoscroll when the chats are being streamed to the user, this needs fixing. once pause if the user uses the scroll wheel to scroll up (which obviously they would do if they want to read previous messages) the autoscroll should pause, and then if they scroll back down to the bottom it should resume. this is a common feature in chat applications and it would make the user experience much better.

## ingest window panel

keep the functionality but redesign the UI to be more user friendly and visually appealing.
simplified and minimal while removing any duplicate or unnecessary elements. also make sure to keep it consistent with the overall design of the app. maybe even add some animations or transitions to make it more engaging for the user.

## flashcards feature improvement

just under the "previous wrong correct next" buttons, in the empty space below, add the following feature.

i want a centered button that says "view all questions", which when pressed, below that opens a scrollable list of all the questions in the flashcard deck, along with the user's previous answers and whether they got them right or wrong. this way, users can easily review all the questions and their performance on them, which can help them identify areas where they need to improve and focus their studying efforts.

i want to emphasize the right and wrong can just be temporary data that is stored in memory and not saved to any file.

I also want this section to be

QuestionQuestionQuestionQuestion
XXXXXXXXXXX (nice subtle animation to indicate clicking on this animation reveals the answer)

QuestionQuestionQuestionQuestion
XXXXXXXXXXX (question answer question answer question)

you get the idea
