require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require('firebase-admin');

const port = process.env.PORT || 3000;
const app = express();

// 1. Middleware (অবশ্যই সবার আগে থাকতে হবে)
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
    ],
    credentials: true,
    optionSuccessStatus: 200,
}));
app.use(express.json());

// 2. Firebase Admin Setup (Error handle করার জন্য try-catch দেওয়া হলো)
try {
    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(decoded);
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }
    console.log("Firebase Admin Initialized");
} catch (error) {
    console.error("Firebase Initialization Error:", error.message);
}

// 3. MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0gdtq1d.mongodb.net/prochallenger?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect(); 
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
    }
    finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
    // note: এখানে client.close() ব্যবহার করবেন না, করলে সার্ভার রিকোয়েস্ট নিতে পারবে না
}
run().catch(console.dir);

// 4. Routes (সার্ভার চেক করার জন্য)
app.get('/', (req, res) => {
    res.send('ProChallenger Server is running...');
});

// 5. Server Listen
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});