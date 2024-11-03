const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');  // QR code library

// Initialize express app
const app = express();
const port = 3000;

// Middleware
app.use(cors({ origin: 'http://localhost:4000' }));  // Adjust to match frontend port
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost/smart_parking', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB:', err);
});

// Define Schemas and Models
const reservationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    slotNumber: { type: Number, required: true },
    reservedAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    slotNumber: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    paymentNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentStatus: { type: String, default: 'Pending' },
    generatedAt: { type: Date }
});

const Reservation = mongoose.model('Reservation', reservationSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// Process Payment Endpoint
app.post('/process-payment', async (req, res) => {
    const { userId, slotNumber, paymentMethod, amount, paymentNumber, email } = req.body;

    // Log the request payload to verify incoming data
    console.log('Received Payment Request:', req.body);

    // Check for missing data
    if (!userId || !slotNumber || !paymentMethod || !amount || !paymentNumber || !email) {
        return res.status(400).json({ message: 'All payment details are required' });
    }

    try {
        // Save the payment details in the database
        const payment = new Payment({
            userId,
            slotNumber,
            paymentMethod,
            paymentNumber, // Save the payment number
            amount,
            paymentStatus: 'InProcess',
            generatedAt: new Date()
        });
        await payment.save();

        // Send confirmation email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'your-email@gmail.com',
                pass: 'your-email-password' // Use environment variables in production
            }
        });

        const mailOptions = {
            from: 'your-email@gmail.com',
            to: email,
            subject: 'Payment Confirmation',
            text: `Your payment for parking slot ${slotNumber} has been confirmed. Amount: ${amount}.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        // Return success response
        res.status(201).json({ message: 'Payment confirmed and email sent!', payment });
    } catch (err) {
        console.error('Error processing payment:', err);
        res.status(500).json({ message: 'Error processing payment', error: err.message });
    }
});

// QR Code Generation Endpoint
app.post('/generate-qrcode', async (req, res) => {
    const { userId, slotNumber, amount, paymentMethod } = req.body;

    if (!userId || !slotNumber || !amount || !paymentMethod) {
        return res.status(400).json({ message: 'Missing required details' });
    }

    try {
        // Construct different QR data based on the payment method
        let qrData;
        switch (paymentMethod) {
            case 'Paytm':
                qrData = `paytm://pay?pa=${userId}&pn=SmartParking&am=${amount}&tn=Parking Reservation for Slot ${slotNumber}`;
                break;
            case 'Google Pay':
                qrData = `upi://pay?pa=${userId}@gpay&pn=SmartParking&am=${amount}&tn=Parking Reservation for Slot ${slotNumber}`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid payment method' });
        }

        // Generate the QR code
        const qrCodeDataURL = await QRCode.toDataURL(qrData);

        // Send the QR code image to the frontend
        res.status(200).json({ qrCode: qrCodeDataURL });
    } catch (err) {
        console.error('Error generating QR code:', err);
        res.status(500).json({ message: 'Error generating QR code' });
    }
});

// Slot Reservation Endpoint
app.post('/reserve-slot', async (req, res) => {
    const { userId, slotNumber } = req.body;

    // Check for missing fields
    if (!userId || !slotNumber) {
        return res.status(400).json({ message: 'User ID and Slot Number are required' });
    }

    try {
        const reservation = new Reservation({ userId, slotNumber });
        await reservation.save();
        console.log('Reservation saved:', reservation);
        res.status(201).json({ message: 'Slot reserved successfully', reservation });
    } catch (err) {
        console.error('Error saving reservation:', err);
        res.status(500).json({ message: 'Error reserving slot' });
    }
});

// Dummy Payment Confirmation Endpoint (mocking Paytm/GPay confirmation)
app.post('/confirm-payment', async (req, res) => {
    const { userId, slotNumber, paymentId } = req.body;
    
    try {
        // Update payment status to "Confirmed" in database (mock logic)
        const payment = await Payment.findOneAndUpdate(
            { userId, slotNumber, _id: paymentId },
            { paymentStatus: 'Confirmed', paidAt: new Date() },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        res.status(200).json({ message: 'Payment confirmed!', payment });
    } catch (err) {
        console.error('Error confirming payment:', err);
        res.status(500).json({ message: 'Error confirming payment', error: err.message });
    }
});

app.get('/dummy-confirmation', async (req, res) => {
    const { userId, slotNumber, paymentId } = req.query;

    try {
        // Find and update the payment status to "Confirmed"
        const payment = await Payment.findOneAndUpdate(
            { userId, slotNumber, _id: paymentId },
            { paymentStatus: 'Confirmed', paidAt: new Date() },
            { new: true }
        );

        if (!payment) {
            return res.status(404).send('Payment not found');
        }

        // Render a confirmation message or redirect back to the website
        res.send('<h2>Payment Confirmed Successfully!</h2><p>You can now proceed with your reservation.</p>');
    } catch (err) {
        console.error('Error in dummy confirmation:', err);
        res.status(500).send('Error processing payment confirmation');
    }
});



// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
