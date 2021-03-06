var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var async = require('async');
var Machine = require('node-machine');
var path = require('path');
var fs = require('fs');

module.exports = function (cb, msg, attachment) {

  // Set the error state
  sails.config.ciQueue.errorState = true;

  // Log the error
  sails.log.error(msg);

  // Find our safe place
  fs.readFile(path.join(sails.config.appPath, ".commit"), function(err, data) {

    // If we get an error here, it's a real fiasco
    if (err) {
      sails.log.error("Could not roll back to previous commit after errors; killing queue.");
      msg += " Additionally, an error occurred trying to roll back to the last known good commit." +
      "  At this point the code may be in an unstable state.  Immediate action is recommended." +
      "  The CI service will be suspended indefinitely; it will need to be restarted once you've fixed the issue.";
      // Kill the task queue so that it doesn't restart the server.   Note that this
      // nulls out the "drain", so the server won't ever restart again until the CI app
      // is restarted.
      sails.config.ciQueue.kill();
    }
    else {
      // Try to roll back to the latest safe commit
      var commit = data;
      sails.log.verbose("Rolling back to commit `"+data+"` via `git checkout "+data+"`...");
      exec("git checkout "+data, {cwd: sails.config.localRepoPath}, function(err) {
        // If we get an error here, it's an even realer fiasco -- the code may be in an
        // unstable state the next time the server restarts.
        if (err) {
          sails.log.error(cb, "Couldn't checkout commit `"+commit+"`; got: "+err);
          msg += " Additionally, an error occurred trying to roll back to the last known good commit." +
          "  At this point the code may be in an unstable state.  Immediate action is recommended." +
          "  The CI service will be suspended indefinitely; it will need to be restarted once you've fixed the issue.";
          // Kill the task queue so that it doesn't restart the server.   Note that this
          // nulls out the "drain", so the server won't ever restart again until the CI app
          // is restarted.
          sails.config.ciQueue.kill();
        }
      });
    }

    if (sails.config.sendEmailOnFailure) {

      var options = {
        to: sails.config.sendEmailTo,
        subject: "Failed deployment of "+sails.config.repository+" on "+server
      };
      if (attachment) {
        options.attachments = [{
          filename: "errors.txt",
          contents: attachment
        }];
      }
      sails.hooks.email.send("failure", {
        error: msg,
        server: server,
        repo: sails.config.repository,
        branch: sails.config.ref.split('/').pop(),
        date: new Date()
      },
      options, function(err){
        if (err) {sails.log.error("MAIL ERR", err);}
      });
    }

    cb();

  });


};
