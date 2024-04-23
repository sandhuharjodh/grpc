const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/subposts');

const Subpost = mongoose.model('Subpost', new mongoose.Schema({
    id: Number,
    content: String,
    postId: String, // Define postId field
    subpostId: String
}));

const packageDefinition = protoLoader.loadSync(path.join(__dirname, '../protos/subposts.proto'));
const subpostsProto = grpc.loadPackageDefinition(packageDefinition);

function findSubpost(call, callback) {
    const postId = call.request.postId; // Here postId should be defined
    // console.log(postId, 'possssssssssssssssssssssss')
    console.log(postId, 'pooooo')
    Subpost.find({ postId })
        .then(subposts => {
            console.log(subposts, 'subbbbbbbbb');
            callback(null, { subposts: subposts.map(subpost => subpost.toObject()) });
        })
        .catch(err => {
            console.error('Error finding subposts:', err);
            callback({ message: err.message, code: grpc.status.INTERNAL });
        });

}


function addSubpost(call, callback) {
    const subpostData = call.request;

    console.log(subpostData, 'subbbbbbbbbbbbbb');


    const newSubpost = new Subpost({
        id: subpostData.id,
        content: subpostData.content,
        postId: subpostData.postId,
        subpostId: subpostData.subpostId // Add subpostId assignment
    });

    newSubpost.save()
        .then(savedSubpost => {
            // Return the saved subpost with subpostId
            const response = {
                postId: savedSubpost.postId,
                content: savedSubpost.content,
                subpostId: savedSubpost.subpostId // Include subpostId in the response
            };

            console.log(response.postId, 'postttttttttttttttttttt')

            callback(null, response);
        })
        .catch(err => {
            callback({
                message: err.message,
                code: grpc.status.INTERNAL
            });
        });
}



const server = new grpc.Server();
server.addService(subpostsProto.Subposts.service, { findSubpost, addSubpost });
server.bindAsync('0.0.0.0:50062', grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
        console.error(`Failed to bind server to port ${port}: ${error.message}`);
    } else {
        console.log(`Server bound to port ${port}`);
        server.start(); // Start the server only if binding is successful
    }
});

