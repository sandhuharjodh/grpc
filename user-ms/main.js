const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/users');

const User = mongoose.model('User', new mongoose.Schema({
    // id: String,
    userId: String,
    name: String,
    department: String
}));

const packageDefinition = protoLoader.loadSync(path.join(__dirname, '../protos/users.proto'));
const usersProto = grpc.loadPackageDefinition(packageDefinition);

function findUser(call, callback) {
    const userId = call.request.userId;

    console.log(userId, 'usssssssssssss')

    User.findOne({ userId })
        .then(user => {
            if (!user) {
                callback({
                    message: 'User not found',
                    code: grpc.status.NOT_FOUND
                });
            } else {
                callback(null, user.toObject());
                console.log(user, 'useeeeeeeeeeeer')

            }
        })
        .catch(err => {
            callback({
                message: err.message,
                code: grpc.status.INTERNAL
            });
        });

}



function addUser(call, callback) {
    const userData = call.request;

    const newUser = new User({
        // id: userData.id,
        userId: userData.userId,
        name: userData.name,
        department: userData.department
    });

    newUser.save()
        .then(savedUser => {
            callback(null, savedUser.toObject());
        })
        .catch(err => {
            callback({
                message: err.message,
                code: grpc.status.INTERNAL
            });
        });

}

const server = new grpc.Server();
server.addService(usersProto.Users.service, { findUser, addUser });
server.bindAsync('0.0.0.0:50060', grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
        console.error(`Failed to bind server to port ${port}: ${error.message}`);
    } else {
        console.log(`Server bound to port ${port}`);
        server.start(); // Start the server only if binding is successful
    }
});
