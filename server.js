require('dotenv').config();
require("./utils.js");
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo')
const saltRounds = 10;
const app = express();
const port = process.env.port || 3000;
console.log(port)

const expireTime = 60 * 60 * 1000; // 1 hour in milliseconds

const Joi = require("joi");

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var {database} = include('databaseConnections');

const userCollection = database.db(mongodb_database).collection("users");

const navLinks = [
    {name: "Home", url: "/"},
    {name: "Members", url: "/members"},
    {name: "Admin", url: "/admin"},
    {name: "Login", url: "/login"},
    {name: "Signup", url: "/signup"},
    {name: "404", url: "/doesnotexist"}
]

app.use(express.urlencoded({extended: false}));
app.use(express.static('public'));
app.set('view engine', 'ejs')

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
    crypto: {
		secret: mongodb_session_secret
	}
})

function isValidSession(req) {
    return (req.session != null && req.session.authenticated);
}

function sessionValidation(req, res, next) {
    if (isValidSession(req)) {
        next();
        return;
    }
    else {
        res.redirect('/login');
    }
}

function isAdmin(req) {
    return (req.session.user_type == "admin");
}

function adminAuthorization(req, res, next) {
    if (!isAdmin(req)) {
        res.status(403).render('error', {error: "You are not authorized to view this page.", navLinks: navLinks});
        console.log(req.session.user_type)
        return;
    }
    next();
}

app.listen(port, () => {
    console.log(`Listening to ${port}`)
})

app.use(session({ 
    secret: node_session_secret,
	store: mongoStore, 
	saveUninitialized: false, 
	resave: true
}
));

app.get('/', (req, res) => {
    res.render('index', {user: req.session.name, authenticated: req.session.authenticated, navLinks: navLinks});
});

// creating user to store in array
app.get('/signup', (req,res) => {
    res.render('signup', {navLinks: navLinks});
});

app.post('/signupSubmit', async (req,res) => {
    var user_name = req.body.name;
    var user_email = req.body.email;
    var user_password = req.body.password;

    const schema = Joi.object(
        {
            user_name: Joi.string().alphanum().max(25).required(),
            user_email: Joi.string().max(25).required(),
			user_password: Joi.string().max(20).required()
		}
    );
        
    const validationResult = schema.validate({user_name, user_email, user_password});
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect("/signup");
        return;
    }

    var hashedPassword = bcrypt.hashSync(user_password, saltRounds);

    if (!user_name) {
        res.send(`Please enter a name!<br>
        <a href='/signup'>Try again</a>`)
    }
    else if (!user_email) {
        res.send(`Please enter an email!<br>
        <a href='/signup'>Try again</a>`)
    }
    else if (!user_password) {
        res.send(`Please enter a password!<br>
        <a href='/signup'>Try again</a>`)
    }
    else {

        await userCollection.insertOne({ name: user_name, email: user_email, password: hashedPassword, type: "admin" }, (err, result) => {
            if (err) {
                console.log(err);
                res.send("Error creating user");
                return;
            }
            console.log("inserted user")
        });
        req.session.authenticated = true;
        req.session.name = user_name;
        req.session.email = user_email;
        req.session.cookie.maxAge = expireTime;
        req.session.user_type = "admin";
            
        
        res.redirect('/members');
    }
});

app.get('/login', (req,res) => {
    res.render('login', {navLinks: navLinks});    
});

app.post('/loginSubmit', async (req,res) => {
    var user_email = req.body.email;
    var user_password = req.body.password;

    const schema = Joi.string().max(25).required();
	const validationResult = schema.validate(user_email);
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.redirect("/login");
	   return;
	}    
    
    const result = await userCollection.find({email: user_email}).project({name: 1, email: 1, password: 1, type: 1, _id: 0}).toArray();

    if (result.length == 0) {
        res.send("User and password not found. <br> <a href='/login'>Try again</a>");
        return;
    }
    
    if (bcrypt.compareSync(user_password, result[0].password)) {
        req.session.authenticated = true;
        req.session.name = result[0].name;
        req.session.email = result[0].email;
        req.session.cookie.maxAge = expireTime;
        req.session.user_type = result[0].type;
        console.log(req.session.user_type)
        res.redirect('/members');
    }
    else {
        res.send(`Invalid email/password combination.
        <br>
        <br>
        <a href='/login'>Try again</a>`);
    }
    

});

app.get('/members', sessionValidation, (req,res) => {
    res.render('members', {user: req.session.name, navLinks: navLinks});
});

app.get('/admin', sessionValidation, adminAuthorization, async (req,res) => {
    const all_users = await userCollection.find({}).toArray();
    all_users.forEach(user => {
        user.adminFunc = "changeToAdmin(req.session.email)";
        user.userFunc = "changeToUser(req.session.email)";
    });
    res.render('admin', {users: all_users, navLinks: navLinks});
});

app.get('/rolechange/:email/:type', sessionValidation, adminAuthorization, async (req,res) => {
    if (req.params.type == "admin") {
        await userCollection.updateOne({email: req.params.email}, {$set: {type: "user"}})
    }
    if (req.params.type == "user") {
        await userCollection.updateOne({email: req.params.email}, {$set: {type: "admin"}})
    }   
    const user = await userCollection.findOne({email: req.params.email});
    res.render('rolechange', {user: user, navLinks: navLinks});
})

app.get('/logout', (req,res) => {
    req.session.destroy();
    res.render('logout', {navLinks: navLinks});
});

app.use(express.static(__dirname + "/public"));

//catch all the other pages, must go at end
app.get("*", (req,res) => {
	res.status(404);
    res.render('404', {navLinks: navLinks});
})