const passport = require("passport");
const LocalStrategy = require("passport-local");
const knex = require("../db/knex");
const bcrypt = require("bcrypt");

module.exports = function (app) {
  passport.use(new LocalStrategy({
      usernameField: "username",
      passwordField: "password",
    }, function (username, password, done) {
      knex("users")
        .where({
          name: username,
        })
        .select("*")
        .then(async function (results) {
          if (results.length === 0) {
            return done(null, false, {message: "Invalid User"});
          } else if (await bcrypt.compare(password, results[0].password)) {
            return done(null, results[0]);
          } else {
            return done(null, false, {message: "Invalid User"});
          }
        })
        .catch(function (err) {
          console.error(err);
          return done(null, false, {message: err.toString()})
        });
    }
  ));
};