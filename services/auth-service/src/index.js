const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
app.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET ;
const PORT = process.env.PORT || 4000;

const getUser = async (email) => {
    try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0];
    } catch (error) {
        console.error('Error fetching user:', error);
        throw error;
    }
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'auth-service' });
});

app.post("/login", async (req, res) => {
    try {
    const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

    const user = await getUser(email);
    if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
            { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/register", async (req, res) => {
    try {
    const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await getUser(email);
        if (user) {
            return res.status(409).json({ message: "User already exists" });
        }

        const result = await pool.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
            [email, password]
        );

        res.status(201).json({ message: "User created successfully", user: result.rows[0] });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/verify", (req, res) => {
    try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
            return res.status(401).json({ valid: false, message: "Missing token" });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ valid: false, message: "Invalid token format" });
        }

            const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, user: { userId: decoded.userId, email: decoded.email } });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ valid: false, message: "Invalid token" });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ valid: false, message: "Token expired" });
        }
        console.error('Token verification error:', error);
        res.status(500).json({ valid: false, message: "Internal server error" });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Auth service running on port ${PORT}`);
});