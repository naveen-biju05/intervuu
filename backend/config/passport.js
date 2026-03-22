import 'dotenv/config';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        // 🔥 STEP 1 — try finding by googleId first
        let user = await User.findOne({ googleId: profile.id });

        // 🔥 STEP 2 — if not found, check by email
        if (!user) {
          user = await User.findOne({ email });

          if (user) {
            // 🔥 LINK existing account with Google
            user.googleId = profile.id;
            user.authProvider = 'google';
            user.avatar = profile.photos?.[0]?.value;
            await user.save();
          } else {
            // 🔥 CREATE new Google user
            user = await User.create({
              name: profile.displayName,
              email,
              password: 'GOOGLE_AUTH_' + Math.random().toString(36),
              authProvider: 'google',
              googleId: profile.id,
              avatar: profile.photos?.[0]?.value,
            });
          }
        }

        done(null, user);
      } catch (err) {
        console.error("GOOGLE AUTH ERROR:", err);
        done(err, null);
      }
    }
  )
);

// Optional debug
console.log("CLIENT ID:", process.env.GOOGLE_CLIENT_ID);

export default passport;