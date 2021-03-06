require("dotenv").config();
const client = require("twilio")(process.env.ACC_SID, process.env.AUTH_TOKEN);
const {
    response
} = require('./responseHandler');
const nodemailer = require("nodemailer");
const redisClient = require("../lib/redis");
const jwt = require("jsonwebtoken");

redisClient.on("error", function (error) {
    console.error(error);
});
// Secures connection.
redisClient.on("connect", () => {
    console.log("Cache connection established");
});


module.exports = class Customer {
    constructor(_sequelize, _customer) {
        this.sequelize = _sequelize
        this.customer = _customer
    }
    // #1
    register(firstname, lastname, surname, email, phonenumber, gender, res) {
        const accountNumber = Math.floor(Math.random() * 10000000000);
        const accountBalance = 10000;
        const pin = 1234;

        const user = {
            firstname,
            surname,
            lastname,
            email,
            phonenumber,
            gender,
            accountNumber,
            accountBalance,
            pin
        };
        this.sequelize.sync().then(() => {
            this.customer
                .create(user)
                .then(() => {
                    const newUser = `${surname}  ${firstname}   ${lastname}`;
                    // message to be sent to the newly registered user!
                    const message = `
         <h2  style="color: white; background-color: #2C6975; padding: 30px; width: 50%;"><strong> Afrobank </strong></h2><br>
         <p> Dear <strong> ${newUser.toUpperCase()}</strong>,</p>
         <p> your <strong>Afrobank</strong> account was created successfully, Thank you for banking with us</p>
         <p>below is your account details </p>
         <p>please note that your account number should not be disclosed to anyone.</p>
         <p> welcome to the <strong>Afrobank</strong> family</p>
         <p>account number: <strong>${accountNumber}</strong></p>
         <p>account name:  <strong> ${newUser.toUpperCase()}</strong></p>
         <p>account balance:<strong> ${accountBalance}</strong></p>
         <p>default pin:<strong> ${pin}</strong></p>

         we urge you to change your transaction pin upon login and keep them confidential.<br>

         Thank you for choosing <strong>Afrobank</strong>.
         `;
                    const subject = "Account opening ";
                    const text = "Welcome to Afrobank";
                    const respMsg = "Customer registered successfully"
                    this.sendMail(message, email, subject, text);
                    response(respMsg, true, 200, res)
                })
                .catch((err) => {
                    const respMsg = "Email already exists."
                    response(respMsg, false, 400, res);
                });
        });
    }

    // #2
    // returns the account balance of the specified user.
    getBalance(id, res) {
        this.customer.findOne({
            raw: true,
            where: {
                accountNumber: id
            }
        }).then((resp) => {
            const respMsg = "Invalid user."
            const data = resp.accountBalance
            redisClient.setex(id, 3600, data);
            !resp ? response(respMsg, false, 404, res) :
                redisClient.get(id, (err, resp) => {
                    err ? response(err, false, 401, res) : response(resp, true, 200, res)
                })

        }).catch((err) => {
            const respMsg = "An error occured."
            response(respMsg, false, 500, res);
        })
    }

    // #3
    // returns all users in the scope
    getUsers(res) {
        this.customer.findAll({
                raw: true
            })
            .then((resp) => {
                const respMsg = "No customer to display";
                resp.length === 0 ? response(respMsg, false, 404, res) : response(resp, true, 200, res)
            })
            .catch((err) => {
                response(err, false, 400, res);
            })
    }

    // #4
    login(accountnumber, firstname, res) {
        const msg = "Account number is required";
        !accountnumber ? response(msg, false, 400, res) :
            this.customer.findOne({
                raw: true,
                where: {
                    accountNumber: accountnumber
                }
            }).then((resp) => {
               const token = jwt.sign({ firstname: resp.firstname, acct: resp.accountNumber}, process.env.USER)
               console.log(token);
                const date = new Date();
                const hours = date.getHours()
                const minutes = date.getMinutes()
                const customerCareLine = '08183430438';
                const message = `
         <h2  style="color: white; background-color: #2C6975; padding: 30px; width: 50%;"><strong> Afrobank </strong></h2><br>
         <p>Dear <strong> ${resp.firstname} ${resp.lastname} ${resp.surname} </strong></p>
         <p>A login attempt was made in your account at <strong>${hours}:${minutes}</strong>.</p>
         <p>If this is you kindly ignore, else, contact us at <strong>${customerCareLine}</strong>.</p><br>

         <p>Thank you for choosing AfroBank.</p> 
        `;
                const text = "Login notification"
                const subject = "Account Login"
                const sucessMsg = "Login successfully";
                const resMsg = "Invalid login parameters"
                firstname !== resp.firstname ? response(resMsg, false, 401, res) :
                    // send customer a notification.
                    this.sendMail(message, resp.email, subject, text)
                response(sucessMsg, true, 200, res, token, resp)
            }).catch((err) => {
                const resMsg = "Check credentials.";
                response(resMsg, false, 401, res);
            })
    }
    // #5
     getUser = (res, accountNumber) => {
        this.customer.findOne({
            raw: true,
            where: {
                accountNumber: accountNumber
            },
        }).then((resp) => {
            const resMsg = "invalid account details.";
            resp.length === 0 ? response(resMsg, false, 404, res) : response(resp, true, 200, res);
        }).catch((err) => {
            console.log(err)
            const resMsg = "User not recognised.";
            response(resMsg, false, 400, res);
        })
    }

    // #6
    setPin(accountNumber, pin, res) {
        const resMsg = "Pin must be numbers.";
        const pinLength = "Pin must be 4 digits."
        isNaN(pin) ? response(resMsg, false, 401, res) : null;
        pin.length !== 4 ? response(pinLength, false, 401, res) :
            this.customer.update({
                pin: pin
            }, {
                where: {
                    accountNumber: accountNumber
                }
            }).then((data) => {
                const resMsg = "Invalid user";
                const message = "Pin updated successfully."
                data[0] === 0 ? response(resMsg, false, 401, res) : response(message, true, 200, res)
            }).catch(() => {
                const message = "Unable to update pin";
                response(message, false, 400, res);
            })
    }

    // #7
    completeTransfer(res, sender, recipient, amount, otp) {
        const message = "All fields are required.";
        const msg = "enter a valid amount";
        !otp || !sender || !recipient || !amount ? response(message, false, 400, res) : null
        isNaN(amount) ? response(msg, false, 401, res) :
            this.customer.findAll({
                raw: true,
                where: {
                    accountNumber: sender
                }
            }).then((user) => {
                const message = "Unable to complete transaction. Check credentials";
                const otperr = "Transaction error.";
                user.length === 0 ? response(message, false, 400, res) : null;
                otp !== user[0].otp ? response(otperr, false, 401, res) :
                    this.customer.findOne({
                        raw: true,
                        where: {
                            accountNumber: recipient
                        }
                    }).then((newRecipient) => {
                        const message = "Check credentials.";
                        !newRecipient ? response(message, false, 401, res) : null;

                        const date = new Date();
                        const reciverBalance = parseInt(newRecipient.accountBalance);
                        const senderBalance = parseInt(user[0].accountBalance);
                        const hours = date.getHours();
                        const minutes = date.getMinutes();
                        const transactionAmt = parseInt(amount);
                        const senderNewBalance = senderBalance - transactionAmt;
                        const recievedTransfer = transactionAmt + reciverBalance;
                        const senderMsg = `
                    <h2  style="color: white; background-color: #2C6975; padding: 30px; width: 50%;"><strong>Afrobank debit alert</strong></h2>
                    <h4>Dear ${user[0].firstname} ${user[0].lastname} ${user[0].surname}</h4>
                    <p>We wish to inform you that a debit transaction just occured on your account with us</p>
                    <p style="text-decoration: underline;"><strong>Transaction notification</strong></p>
                    <p>Description: CASH-TRANSFER</p>
                    <p>Amount     :<strong> ${transactionAmt} </strong></p>
                    <p>Time       :<strong> ${hours} : ${minutes}</strong></p>
                    <p>Balance    : <strong>NGN ${senderBalance}</strong></p>
                    <p>Recipient  : <strong>${newRecipient.accountNumber} ${newRecipient.firstname} ${newRecipient.lastname} ${newRecipient.surname}</strong></p>
                    Thank you for banking with <strong> Afrobank </strong>. 
                    `;
                        const recipientMsg = `
                      <h2 style="color: white; background-color: #2C6975; padding: 30px; width: 50%;"><strong>Afrobank Credit alert</strong></h2><br>
                       <h4>Dear ${newRecipient.firstname} ${newRecipient.lastname} ${newRecipient.surname}</h4>
                      <p>We wish to inform you that a credit transaction just occured on your account with us</p>
                      <p style="text-decoration: underline;"><strong>Transaction notification</strong></p>
                     <p>Description : CREDIT</p>
                     <p>Amount      : <strong>${transactionAmt}</strong></p>
                     <p>Time        : <strong>${hours} : ${minutes}</strong></p>
                     <p>Balance     : <strong>NGN ${recievedTransfer}</strong></p>  
                     <p>Sender      : <strong>${user.firstname} ${user.lastname} ${user.surname}</strong></p><br>
                     Thank you for banking with <strong> Afrobank </strong>. 
                     `;
                        const SenderSms = `
                    Acct: ${sender}
                    Amt: ${amount}
                    Desc: Transfer to ${recipient}
                    Avail: ${senderNewBalance};
                    `;
                        const reciSms = `
                    Acct: ${recipient}
                    Amt: ${amount}
                    Desc: Transfer to ${recipient}
                    Avail: ${senderNewBalance};
                    `;
                        this.customer.update({
                            accountBalance: senderNewBalance,
                            otp: null
                        }, {
                            where: {
                                accountNumber: user[0].accountNumber,
                            },
                        }).then(() => {
                            this.customer
                                .update({
                                    accountBalance: recievedTransfer,
                                }, {
                                    where: {
                                        accountNumber: newRecipient.accountNumber,
                                    },
                                })
                                .then(() => {
                                    const text = "Transaction notification";
                                    const senderSubj = `AeNS Transaction Alert [DEBIT:${amount}.00]`;
                                    const reciverSubj = `AeNS Transaction Alert [CREDIT:${amount}.00]`
                                    // Send both parties notification upon transaction completion
                                    const {
                                        sendText,
                                        sendMail
                                    } = this;
                                    sendText(user[0].phonenumber, SenderSms)
                                    sendText(newRecipient.phonenumber, reciSms)
                                    sendMail(senderMsg, user[0].email, senderSubj, text);
                                    sendMail(recipientMsg, newRecipient.email, reciverSubj, text);

                                    const resMsg = `TRANSACTION COMPLETED SUCCESSFULLY.`;
                                    response(resMsg, true, 200, res);
                                }).catch(() => {
                                    const resMsg = "Unable to complete transaction";
                                    response(resMsg, false, 400, res);
                                });
                        })
                    })
            })
    }

    // #8
    updateOtp(accountNumber) {
        setTimeout(() => {
            this.sequelize.sync().then(() => {
                this.customer.update({
                    otp: null,
                }, {
                    where: {
                        accountNumber: accountNumber
                    }
                })
            })
        }, 900000);
    }
    // #9
    sendText(phonenumber, message) {
        client.messages
            .create({
                from: "+15017122661",
                body: message,
                to: phonenumber,
            })
            .then((message) => console.log(message.sid));
    }
    // #10
    sendMail(message, recipient, subject, text) {
        async function main() {
            // create reusable transporter object using the default SMTP transport
            let transporter = nodemailer.createTransport({
                host: "smtp.gmail.com",
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.EMAIL, // Specific gmail account which can be found in the confi
                    pass: process.env.EMAIL_PASSWORD, // Specific gmail account which can be found in the co
                },
                tls: {
                    rejectUnauthorized: false,
                },
            });
            let info = await transporter.sendMail({
                from: `Afrobank ${process.env.EMAIL}`, // sender address
                to: recipient, //reciever address that was gotten from the frontend/client
                subject: subject,
                text: text,
                html: message,
            });
            // console.log("completed");
            console.log("Message sent: %s", info.messageId);
            console.log(
                "Preview URL: %s",
                nodemailer.getTestMessageUrl(info)
            );
        }
        main();
    }
    // #11
    updateTransactionHistory(type, acctNo, transactionHistory) {
        this.sequelize.sync().then(() => {
            transactionHistory.update({
                transactionType: type,
                accountNumber: 1234
            }, {
                where: {
                    accountNumber: acctNo
                }
            }).then(() => {
                console.log("success")
            }).catch((err) => {
                console.log(err);
            })
        })
    }

    // #12
    deleteCustomer(accountNo, res) {
        this.sequelize.sync().then(() => {
            this.customer.destroy({
                raw: true,
                where: {
                    accountNumber: accountNo
                }
            }).then((resp) => {
                const msg = "Customer doesn't exist.";
                const confMsg = "Customer deleted";
                resp === 0 ? response(msg, false, 400, res) : response(confMsg, true, 200, res);
            }).catch(() => {
                const msg = "Unable to delete customer."
                response(msg, false, 400, res);
            })
        })
    }
}