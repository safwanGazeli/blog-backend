require("dotenv").config();
const path = require("path");
const express = require("express");
const app = express();
const passport = require("passport");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const session = require("express-session");
const passportConfig = require("./config/passport");
const postRoutes = require("./routes/postRoutes");
const errorHandler = require("./middlewares/errorHandler");
const commentRoutes = require("./routes/commentRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required");
}

const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) {
  throw new Error("MONGODB_URL is required");
}

//middlewares: passing form data
app.use(express.urlencoded({ extended: true }));

const sessionStore = MongoStore.create({ mongoUrl });
app.set("sessionStore", sessionStore);

//session middleware
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
  })
);
// Method override middleware
app.use(methodOverride("_method"));
//passport
passportConfig(passport);
app.use(passport.initialize());
app.use(passport.session());
//EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
//Home route
app.get("/", (req, res) => {
  res.render("home", {
    user: req.user,
    error: "",
    title: "Home",
  });
});
//routes
app.use("/auth", authRoutes);
app.use("/posts", postRoutes);
app.use("/", commentRoutes);
app.use("/user", userRoutes);

//error handler
app.use(errorHandler);

module.exports = app;
