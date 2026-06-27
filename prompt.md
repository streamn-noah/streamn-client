i want to add a new page and a bunch of new features so buckle up.

the new page i want to add is call library, it will consist of the users watch histories, liked movies or show(new features), and watchlist (new feature). Then settings and logout

Users will be able to like a movie to show that theyre interested, well use it create a profile for them to know what kind of movie or genres they like

Watchlist are like playlists from spotify but for movies, so users can create a watchlist and add movies or shows they want to watch to it, they can keep it private, share it with friend (another new feature) or make it public to the discover page.

Well be using supabase for this. This also means that theyll need to have an account, well be using sso (google and apple signin) or email (otp verification).

So the onboarding flow is pretty simple, after they sign in, a modal will pop up asking them to pick their top favorite genres, after that, the next step will be them selecting their top favorite movie, from this well be able to pull and store important info like the genres they like, what type of movies they like, any similarities like if their favorite movies have a director in common. main point is that it is stored i the backend to be used for better recommendation as the app grows