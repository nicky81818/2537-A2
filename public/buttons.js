require('dotenv').config();
require("../utils.js");
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo')


const mongodb_database = process.env.MONGODB_DATABASE;

var {database} = include('databaseConnections');
const userCollection = database.db(mongodb_database).collection("users");



async function changeToAdmin() {
    await userCollection.updateOne({email: req.session.email}, {$set: {type: "admin"}})
    req.session.user_type = "admin";
    console.log("changed to admin")
}
async function changeToUser() {
    await userCollection.updateOne({email: req.session.email}, {$set: {type: "user"}})
    req.session.user_type = "user";
    console.log("changed to user")
}
document.getElementById("changeToAdmin").addEventListener("click", changeToAdmin);
document.getElementById("changeToUser").addEventListener("click", changeToUser);
