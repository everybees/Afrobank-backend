"use strict";
const nodemailer = require("nodemailer");
require("dotenv").config();
const { customer } = require("../../model/customer");
const { sequelize } = require("../../config/database/dbconnect");
const Customer = require("../../controller/index");


module.exports = {
  register:(req, res) => {
    const { firstname, lastname, surname, email, phonenumber, gender, } = req.body;
    const newUser = new Customer(sequelize, customer);
    newUser.register(firstname, lastname, surname, email, phonenumber, gender, res);
  },
};
