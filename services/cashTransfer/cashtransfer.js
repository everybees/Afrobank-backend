// const db = require("../../config/database/dbconnect");
const {
  sequelize
} = require("../../config/database/dbconnect");
const {
  customer
} = require("../../model/customer");
const otpGenerator = require('otp-generator');
const Customer = require("../../controllers/index");
const newCustomer = new Customer(sequelize, customer);


module.exports = {
  transfer: (req, res) => {
    const {
      sender,
      recipient,
      amount,
      pin
    } = req.body;
    // Queries the database, checks if the sender exists in the data bases
    sequelize.sync().then(() => {
      customer
        .findOne({
          raw: true,
          where: {
            accountNumber: sender,
          },
        })
        .then((Sender) => {
          if (!Sender) {
            res.status(404).json({
              success: false,
              message: "Enter a valid account number.",
            });
          }
          if (pin !== Sender.pin) {
            res.status(401).json({
              status: false,
              message: "Invalid pin.",
            });
          } else {
            customer
              .findOne({
                raw: true,
                where: {
                  accountNumber: recipient,
                },
              })
              .then((Recipient) => {
                if (!Recipient) {
                  res.status(404).json({
                    success: false,
                    message: "Recipient account number is invalid.",
                  });
                } else {
                  if (isNaN(amount)) {
                    res.status(401).json({
                      status: false,
                      message: "enter a valid amount",
                    });
                  } else {
                    const senderBalance = parseInt(Sender.accountBalance);
                    //  checks if the sender  has  enough balance to proceed with the transaction
                    if (senderBalance <= 0) {
                      res.status(401).json({
                        status: false,
                        message: "your account balance is low",
                      });
                    } else if (amount <= 0) {
                      res.status(401).json({
                        success: false,
                        message: "Enter a valid amount.",
                      });
                    } else if (amount > senderBalance) {
                      res.status(401).json({
                        success: false,
                        message: "Insufficient balance.",
                      });
                    } else {
                      const otp = otpGenerator.generate(6, {
                        alphabets: false,
                        digits: true,
                        specialChars: false,
                        upperCase: false
                      })

                      const message = `Afrobank otp <strong>${otp}</strong>`
                      const subject = `AeNS Transaction OTP`;
                      const text = `OTP`
                      newCustomer.sendMail(message, Sender.email, subject, text);
      
                      customer.update({
                        otp: otp
                      }, {
                        where: {
                          accountNumber: sender
                        }
                      })

                      res.status(200).json({
                        success: true,
                        message: "OTP sent to your email. It expires 15 minutes."
                      })
                    }
                  }
                }
              });
          }
        });
    });
    newCustomer.updateOtp(sender);
  },
  completeTransfer: (req, res) => {
    const {
      otp,
      sender,
      recipient,
      amount
    } = req.body;
    const newCustomer = new Customer(sequelize, customer)
    newCustomer.completeTransfer(res, sender, recipient, amount, otp);
  }
};