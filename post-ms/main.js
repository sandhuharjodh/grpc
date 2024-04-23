const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/posts', { useNewUrlParser: true, useUnifiedTopology: true });

// Define Post schema and model
const PostSchema = new mongoose.Schema({
    postId: String,
    id: Number,
    title: String,
    userId: Number
});
const Post = mongoose.model('Post', PostSchema);

// Load gRPC proto files
const packageDefinitionPost = protoLoader.loadSync(path.join(__dirname, '../protos/posts.proto'));
const packageDefinitionSubpost = protoLoader.loadSync(path.join(__dirname, '../protos/subposts.proto'));

// Load package definitions
const postsProto = grpc.loadPackageDefinition(packageDefinitionPost);
const subpostsProto = grpc.loadPackageDefinition(packageDefinitionSubpost);

// Create gRPC client for the subpost-ms service
const subpostsStub = new subpostsProto.Subposts('0.0.0.0:50062', grpc.credentials.createInsecure());

// Function to find posts
async function findPost(call, callback) {
    const userId = call.request.userId;

    console.log(userId, 'userId');

    try {
        const posts = await Post.find({ userId }).lean().exec();
        console.log(posts, 'posts');

        // Fetch subposts related to each post
        const postPromises = posts.map(async post => {
            try {
                const subpostResponse = await new Promise((resolve, reject) => {
                    subpostsStub.findSubpost({ postId: post.postId }, (err, subpostResponse) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(subpostResponse.subposts);
                        }
                    });
                });
                post.subposts = subpostResponse; // assuming subposts are directly available in the response
            } catch (error) {
                console.error(`Error fetching subposts for postId ${post.postId}:`, error);
                throw error; // Propagate the error up to the catch block below
            }
        });

        // Wait for all subpost fetches to complete
        await Promise.all(postPromises);

        callback(null, { posts });
    } catch (err) {
        console.error('Error finding posts:', err);
        callback({ message: err.message, code: grpc.status.INTERNAL });
    }
}


// Function to add new posts
function addPost(call, callback) {
    const postData = call.request;

    console.log(postData, 'postDatat')

    const newPost = new Post({
        postId: postData.postId,
        id: postData.id,
        title: postData.title,
        userId: postData.userId
    });

    newPost.save().then(savedPost => {
        console.log('Post saved:', savedPost);

        // Return the saved post with postId
        const response = {
            id: savedPost.id,
            title: savedPost.title,
            userId: savedPost.userId,
            postId: savedPost.postId
        };

        callback(null, response);
    }).catch((err) => {
        console.error('Error saving post:', err);
        callback({
            message: err.message,
            code: grpc.status.INTERNAL
        });
    });
}



// Create gRPC server and add services
const server = new grpc.Server();
server.addService(postsProto.Posts.service, { findPost, addPost });

// Bind the server to port 50061
server.bindAsync('0.0.0.0:50061', grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
        console.error(`Failed to bind server to port ${port}: ${error.message}`);
    } else {
        console.log(`Server bound to port ${port}`);
        server.start();
    }
});
