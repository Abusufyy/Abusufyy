const express = require('express');

const app = express();
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const MongoDBStore = require('connect-mongodb-session')(session); // Corrected session store import
const userModel = require('./model/userModel');
const studentModel = require('./model/studentModel');
const Log = require('./model/log');
const bodyParser = require('body-parser');
const flash = require('connect-flash');
const moment= require('moment')
const path= require('path');
const nodemailer= require('nodemailer');
const joi= require('joi')
const csv= require('csv-parser')
const fs= require('fs')
const crypto = require('crypto')
const multer = require('multer')
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');

//  nodemailer transporter

let transporter= nodemailer.createTransport({
  service:'gmail',
  auth: {
    user:'nlearnafrica@gmail.com',
    pass: 'ghyvagprrzityasf'
  },
  rejectUnauthorized: false
});

  const url= 'mongodb://127.0.0.1:27017/shick';
//const url= 'mongodb+srv://amady:<KATsina10>@atlascluster.zanqt9p.mongodb.net/shick';

mongoose.connect( url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then((res) => {
  console.log('mongodb connected');
});


// MongoDB session store
const store = new MongoDBStore({
  uri: url,
  collection: 'mySession',
});

app.use(bodyParser.urlencoded({extended:true}));
app.set('view engine', 'ejs');
app.use(flash());

app.use(express.json());
app.use(bodyParser.json())
app.use(express.static('public'));
app.use(session({
  secret: 'key that will sign the cookie',
  resave: false,
  saveUninitialized: false,
  store: store,
}));

app.get('/register', (req, res) => {
  //req.session.destroy()
  const message= req.flash('message')
  res.render('register', {message});
});

app.post('/register', async (req, res) => {
  console.log(req.body.email)
  const { name, email, password, passwordrep, bloodGroup, genoType, schoolFees, phone } = req.body;

  // Validate the request body using Joi
  const schema = joi.object({
    name: joi.string().required().trim(),
    passwordrep: joi.ref('password'),
    email: joi.string().email().required(),
    password: joi.string().required(),
    bloodGroup: joi.string().required(),
    genoType: joi.string().required(),
    schoolFees: joi.string().required(),
    phone: joi.string().required(),
  }).unknown(true);

  const { error } = schema.validate(req.body);

  if (error) {
    req.flash('message', error.details[0].message);
    return res.redirect('/register');
  }

  // Check if the email is already registered
  const userExists = await userModel.findOne({ email });

  if (userExists) {
    req.flash('message', 'This email is already registered.');
    return res.redirect('/register');
  }

  try {
    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate a random user ID
    const userId = crypto.randomBytes(16).toString('hex');

    // Create a new user document
    const user = new userModel({
      name,
      email,
      password: hashedPassword,
      role: 'user',
      genoType,
      bloodGroup,
      schoolFees,
      phone
    });

    // Save the user to the database
    await user.save();

    req.flash('message', 'You have successfully registered.');
    return res.redirect('/register');
  } catch (error) {
    console.error(error);
    req.flash('message', 'An error occurred during registration.');
    return res.redirect('/register');
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  let user = await userModel.findOne({ email });

  if (!user) {
    req.flash('message', 'This email is not registered');
    return res.redirect('/login');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    req.flash('message', 'This password is incorrect');
    return res.redirect('/login');
  }

  const role = user.role || 'user';

  // Set the 'isLoggedIn' and 'role' sessions
  req.session.isLoggedIn = true;
  req.session.role = role;
  req.session.name = user.name; // Assuming you want to store the user's name in the session

  // Create a sessionData object to hold all session data
  const sessionData = {
    isLoggedIn: req.session.isLoggedIn,
    role: req.session.role,
    name: req.session.name,
    email: req.session.email,
  };

  res.render('dashboard', { sessionData });
});

// Student SignIn Page Route
app.get('/studentSignIn', (req, res) => {
  // Retrieve the flash message (e.g., success message) if present
  const message = req.flash('success');

  // Render the student signout page and pass the flash variable if needed
  res.render('signIn', { message });
});


app.post('/studentSignIn', async (req, res) => {
  try {
    const userEmail = req.body.email;
    const today = moment().startOf('day');
    const signInTime = moment();

    const user = await userModel.findOne({ email: userEmail });

    if (!user) {
    req.flash('success', 'Sign-in failed! User not registered.');
      res.redirect('/studentSignIn');
      return;
    }

    const late = signInTime.isAfter(today.clone().hour(8));

    // Create a new log entry
    const logEntry = new Log({
      userId: user.email,
      date: today,
      events: [{ signIn: signInTime }],
    });

    // Save the log entry to the database
    await logEntry.save();

    const mailOptions = {
      from: 'nlearnafrica@gmail.com',
      to: user.email,
      subject: 'Sign-in Notification',
      text: `Hello ${user.name},\n\nYou have successfully signed in on ${today.format('MMMM Do YYYY')} at ${signInTime.format('h:mm A')}. You are ${late ? 'late' : 'on time'} for your sign-in.`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        req.flash('error', 'Error occurred while sending the email.');
      } else {
        req.flash('success', 'Sign-in successful! Email sent.');
      }
      res.redirect('/studentSignIn');
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Error occurred during student sign-in.');
    res.redirect('/studentSignIn');
  }
});


// Student Signout Page Route
app.get('/studentSignOut', (req, res) => {
  // Retrieve the flash message (e.g., success message) if present
  const message = req.flash('success');

  // Render the student signout page and pass the flash variable if needed
  res.render('signOut', { message });
});


// Student Sign-Out Route
app.post('/studentSignOut', async (req, res) => {
  try {
    const userEmail = req.body.email; // Access the email submitted in the form
    const today = moment().startOf('day'); // Get the start of the current day
    const signOutTime = moment(); // Get the current time

    // Find or create a log entry for the user on the current day
    let logEntry = await Log.findOne({
      userId: userEmail,
      date: today,
    });

    if (!logEntry) {
      // If there's no log entry for today, create a new one
      logEntry = new Log({
        userId: userEmail,
        date: today,
        events: [],
      });
    }

    // Check if there's an existing signIn event
    const signInEvent = logEntry.events.find((event) => event.signIn);

    if (!signInEvent) {
      req.flash('error', 'No sign-in record found for today.');
      return res.redirect('/studentSignOut');
    }

    // Update the signOut time for the signIn event
    signInEvent.signOut = signOutTime;

    // Calculate the duration of the user's session
    const sessionDuration = signOutTime.diff(signInEvent.signIn, 'minutes');

    // Save the updated log entry
    await logEntry.save();

    // Send an email reminder to the user
    const user = await userModel.findOne({ email: userEmail });

    const mailOptions = {
      from: 'nlearnafrica@gmail.com',
      to: user.email,
      subject: 'Sign-out Reminder',
      text: `Hello ${user.name},\n\nYou have signed out on ${today.format('MMMM Do YYYY')} at ${signOutTime.format('h:mm A')}.\n\nYou signed in today at ${moment(signInEvent.signIn).format('h:mm A')} and your session duration was ${sessionDuration} minutes.`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        req.flash('error', 'Error occurred while sending the email.');
      } else {
        req.flash('success', 'Sign-out successful! Sign-out reminder sent.');
      }

      res.redirect('/studentSignOut');
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Error occurred during student sign-out.');
    res.redirect('/studentSignOut');
  }
});


app.get('/logRecords', async (req, res) => {
  try {
    // Find all log records and sort them by date in descending order (most recent first)
    const logRecords = await Log.find().sort({ date: -1 });

    // Create an array to store user data for each log record
    const userData = [];

    // Fetch user information for each log record
    for (const record of logRecords) {
      const user = await userModel.findOne({ email: record.userId });
      userData.push(user);
    }

    res.render('logRecords', { logRecords, userData });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/userRecords', async (req, res) => {
  try {
    // Find all log records and sort them by date in descending order (most recent first)
    const userRecords = await userModel.find().sort({ date: -1 });


    res.render('userRecords', { userRecords});
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/login', (req, res)=>{
  const message= req.flash('message')
  res.render('login', {message});
})
function checkAuth(req, res, next) {
  if (!req.session.isLoggedIn) {
    // User is not authenticated, redirect to the login page
    req.flash('message', 'Please log in to access this page');
    return res.redirect('/login');
  }
  // User is authenticated, proceed to the next middleware or route
  next();
}


app.get('/dashboard', checkAuth, async (req, res)=>{
  const sessionData = {
    isLoggedIn: req.session.isLoggedIn,
    role: req.session.role,
    name: req.session.name,
    email: req.session.email,
  };
  res.render('dashboard', {sessionData});
})

app.get('/logout', (req, res)=>{
  req.session.destroy();
  res.redirect('/login')
});


app.get('/convertToPDFAndSendEmail', async (req, res) => {
  try {
    // Use Puppeteer to capture the webpage as a PDF
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/logRecords'); // Replace with your webpage URL
    const pdfBuffer = await page.pdf({ format: 'A4' });

    // Close the browser to free up resources
    await browser.close();

    // Define the list of recipients' email addresses
    const recipients = ['amadysiraj1@gmail.com', 'recipient2@example.com', 'recipient3@example.com', /* Add more recipients */];

    // Set a batch size (e.g., 10) to control the number of emails sent at once
    const batchSize = 10;

    // Send emails in batches
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batchRecipients = recipients.slice(i, i + batchSize);

      const batchPromises = batchRecipients.map((recipient) => {
        const mailOptions = {
          from: 'ELDAN',
          to: recipient,
          subject: 'Webpage to PDF',
          text: 'Attached is the webpage as a PDF.',
          attachments: [
            {
              filename: 'webpage.pdf',
              content: pdfBuffer,
            },
          ],
        };

        return new Promise((resolve, reject) => {
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error(error);
              reject(error);
            } else {
              console.log('Email sent to ' + recipient + ': ' + info.response);
              resolve();
            }
          });
        });
      });

      try {
        await Promise.all(batchPromises);
      } catch (error) {
        // Handle errors if needed
      }
    }

    res.status(200).send('Emails sent successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});



app.listen(process.env.PORT || 3000);
