const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const http = require('http');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const jwtSecret = process.env.JWT_SECRET;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useUnifiedTopology: true });
let db;

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    db = client.db('User');

    // Call the approveApplications function after the connection is established
    approveApplications().catch(console.error);
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
    process.exit(1);
  }
}

// Call the connectToMongoDB function to connect to the database
connectToMongoDB();




app.get('/', (req, res) => {
  res.render('LoginPage');
});

app.get('/register', (req, res) => {
  res.render('Register');
});

app.get('/vendingLoc', (req, res) => {
  res.render('vendingLoc');
});

app.post('/register', async (req, res) => {
  const { uname, psw, email, contact } = req.body;
  console.log('Registration Data:', { uname, psw, email, contact });

  const hashedPassword = await bcrypt.hash(psw, 10);
  try {
    const collection = db.collection('userDetails');
    const result = await collection.insertOne({ uname, password: hashedPassword, email, contact });
    console.log('Insert Result:', result);
    res.send('User registered successfully');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Error registering user.');
  }
});

app.get('/hotspotSel', async (req, res) => {
  try {
    const location = req.query.location;
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).send('Not logged in.');
    }

    const payload = jwt.verify(token, jwtSecret);
    const collection = db.collection('userDetails');
    const user = await collection.findOne({ _id: new ObjectId(payload._id) });

    if (!user) {
      return res.status(404).send('User not found.');
    }

    if (user.location !== location) {
      user.location = location;
      await collection.updateOne({ _id: new ObjectId(payload._id) }, { $set: user });
    }

    res.render('hotspotSel', { location: user.location });
  } catch (error) {
    console.error('Error in /hotspotSel:', error);
    res.status(500).send('Internal Server Error.');
  }
});

app.post('/login', async (req, res) => {
  const { category, uname, psw } = req.body;

  // Check if the user is an administrator
  if (category === 'administrator') {
    if (uname === 'admin1' && psw === 'administer') {
      const token = jwt.sign({ _id: 'admin1' }, jwtSecret); // Create a token for the administrator
      res.cookie('token', token, { httpOnly: true }); // Set the token in a cookie
      return res.redirect('/Administerpage');
    } else {
      return res.send('Invalid username or password.');
    }
  }

  // For other users
  try {
    const collection = db.collection('userDetails');
    const query = { uname };
    const user = await collection.findOne(query);

    if (user && psw && user.password) {
      const passwordMatch = await bcrypt.compare(psw, user.password);

      if (passwordMatch) {
        const token = jwt.sign({ _id: user._id }, jwtSecret);
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/account');
      } else {
        res.send('Invalid username or password.');
      }
    } else {
      res.send('Invalid username or password.');
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).send('Error logging in user.');
  }
});

app.get('/account', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).send('Not logged in.');
    }
    const payload = jwt.verify(token, jwtSecret);
    const collection = db.collection('userDetails');
    const user = await collection.findOne({ _id: new ObjectId(payload._id) });
    if (!user) {
      return res.status(404).send('User not found.');
    }
    console.log('User Data:', user); // Log user data to the console

    res.render('Account', { user: user });
  } catch (error) {
    console.error('Error retrieving user:', error);
    res.status(500).send('Error retrieving user.');
  }
});


app.post('/submit_application', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).send('Not logged in.');
    }
    const payload = jwt.verify(token, jwtSecret);
    const collection = db.collection('userDetails');
    let user;
    if (payload._id !== 'admin1') {
      user = await collection.findOne({ _id: new ObjectId(payload._id) });
    } else {
      user = await collection.findOne({ _id: payload._id });
    }
    if (!user) {
      return res.status(404).send('User not found.');
    }

    const { name, age, gender, aadhaar_number, contact_number, email, location, hotspot, slots, vending_date, start_time, end_time, charge_per_hour, goods_category, specific_products } = req.body;

    const applicationCollection = db.collection('applications');
    const result = await applicationCollection.insertOne({ name, age, gender, aadhaar_number, contact_number, email, location, hotspot, slots, vending_date, start_time, end_time, charge_per_hour, goods_category, specific_products, userId: user._id, approved: false });
    console.log('Insert Result:', result);
    res.send('Application submitted successfully');
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).send('Error submitting application.');
  }
});


app.get('/licenseApplication', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).send('Not logged in.');
    }

    const payload = jwt.verify(token, jwtSecret);
    const collection = db.collection('userDetails');
    const user = await collection.findOne({ _id: new ObjectId(payload._id) });

    if (!user) {
      return res.status(404).send('User not found.');
    }

    // Pass the user data to the license application page
    res.render('licenseApplication', { user: user });
  } catch (error) {
    console.error('Error in /licenseApplication:', error);
    res.status(500).send('Internal Server Error.');
  }
});

async function approveApplications() {
  try {
    console.log('Running approveApplications function...');

    // Calculate the date two days from now
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Convert dates to YYYY-MM-DD format
    const nowStr = now.toISOString().split('T')[0];
    const twoDaysFromNowStr = twoDaysFromNow.toISOString().split('T')[0];

    // Fetch all applications that are not yet approved and whose vending date is within the next two days
    const applicationCollection = db.collection('applications');
    const applications = await applicationCollection.find({ approved: false, vending_date: { $gte: nowStr, $lte: twoDaysFromNowStr } }).toArray();
    console.log(`Found ${applications.length} applications to process.`);

    // Sort applications by total amount in descending order
    applications.sort((a, b) => (b.charge_per_hour * (b.end_time - b.start_time)) - (a.charge_per_hour * (a.end_time - a.start_time)));

    // Initialize an empty object to store the approved slots
    let approvedSlots = {};

    // Process each application
    for (const application of applications) {
      console.log(`Processing application ${application._id}...`);

      // Calculate the total amount for the current application
      const totalAmount = application.charge_per_hour * (application.end_time - application.start_time);

      // Check if the current slot conflicts with any of the already approved slots at the same location
      let conflict = false;
      for (let slot of approvedSlots[application.location] || []) {
        if (slot.start_time < application.end_time && slot.end_time > application.start_time) {
          conflict = true;
          break;
        }
      }

      // If there's no conflict, approve the application
      if (!conflict) {
        console.log(`Approving application ${application._id}...`);
        const result = await applicationCollection.updateOne({ _id: application._id }, { $set: { approved: true } });
        console.log('Update Result:', result);

        // Add the current slot to the approved slots
        if (!approvedSlots[application.location]) {
          approvedSlots[application.location] = [];
        }
        approvedSlots[application.location].push({ start_time: application.start_time, end_time: application.end_time, totalAmount: totalAmount });
      } else {
        console.log(`Skipping application ${application._id} due to conflict...`);
      }
    }
  } catch (error) {
    console.error('Error in approveApplications:', error);
  }
}

app.get('/Administerpage', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).send('Not logged in.');
    }
    const payload = jwt.verify(token, jwtSecret);

    // Check if the user is an administrator
    if (payload._id !== 'admin1') {
      return res.status(403).send('Unauthorized.');
    }

    // Fetch all applications and approved applications from the database
    const collection = db.collection('applications');
    const allLicenses = await collection.find({}).toArray();
    const approvedLicenses = await collection.find({ approved: true }).toArray();

    if (!allLicenses || !approvedLicenses) {
      return res.status(404).send('Applications not found.');
    }

    // Render the administer page with all licenses and approved licenses
    res.render('Administerpage', { allLicenses: allLicenses, approvedLicenses: approvedLicenses });
  } catch (error) {
    console.error('Error retrieving applications:', error);
    res.status(500).send('Error retrieving applications.');
  }
});

app.get('/viewLicense', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      console.log('No token found');
      return res.status(401).send('Not logged in.');
    }
    const payload = jwt.verify(token, jwtSecret);
    const collection = db.collection('userDetails');
    const user = await collection.findOne({ _id: new ObjectId(payload._id) });

    if (!user) {
      console.log('User not found');
      return res.status(404).send('User not found.');
    }

    console.log('User Details:', user); // Log user details to the console

    const applicationCollection = db.collection('applications');
    const allLicenses = await applicationCollection.find({ userId: user._id }).toArray();
    console.log('All Licenses:', allLicenses); // Log all licenses to the console

    allLicenses.forEach(application => {
        const startTime = new Date(`1970-01-01T${application.start_time}Z`);
        const endTime = new Date(`1970-01-01T${application.end_time}Z`);
        const hours = Math.abs(endTime - startTime) / 36e5;
        application.totalAmount = hours * application.charge_per_hour;
    });
    const approvedLicenses = await applicationCollection.find({ userId: user._id, approved: true }).toArray();
    console.log('Approved Licenses:', approvedLicenses); // Log approved licenses to the console

    approvedLicenses.forEach(application => {
        const startTime = new Date(`1970-01-01T${application.start_time}Z`);
        const endTime = new Date(`1970-01-01T${application.end_time}Z`);
        const hours = Math.abs(endTime - startTime) / 36e5;
        application.totalAmount = hours * application.charge_per_hour;
    });

    res.render('viewLicense', { allLicenses: allLicenses, approvedLicenses: approvedLicenses });
  } catch (error) {
    console.error('Error retrieving licenses:', error);
    res.status(500).send('Error retrieving licenses.');
  }
});



let port = process.env.PORT || 8000;

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${port} is in use, trying with port ${port + 1}`);
    server.listen(++port);
  }
});
