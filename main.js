const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const express = require('express');
const { promisify } = require('util');

const packageDefinitionUser = protoLoader.loadSync(path.join(__dirname, '/protos/users.proto'));
const packageDefinitionPost = protoLoader.loadSync(path.join(__dirname, '/protos/posts.proto'));
const packageDefinitionSubpost = protoLoader.loadSync(path.join(__dirname, '/protos/subposts.proto'));

const usersProto = grpc.loadPackageDefinition(packageDefinitionUser);
const postsProto = grpc.loadPackageDefinition(packageDefinitionPost);
const subpostsProto = grpc.loadPackageDefinition(packageDefinitionSubpost);

const usersStub = new usersProto.Users('0.0.0.0:50060', grpc.credentials.createInsecure());
const postsStub = new postsProto.Posts('0.0.0.0:50061', grpc.credentials.createInsecure());
const subpostsStub = new subpostsProto.Subposts('0.0.0.0:50062', grpc.credentials.createInsecure());

const app = express();
app.use(express.json());

const restPort = 5001;

// Middleware for logging requests
app.use((req, res, next) => {
    console.log(`Received ${req.method} request for ${req.url}`);
    next();
});

app.get('/users/:userId', (req, res, next) => {
    const userId = req.params.userId;

    try {
        // Fetch user data using gRPC call
        console.log(`Fetching user data for userId: ${userId}`);
        usersStub.findUser({ userId: userId }, (err, userResponse) => {
            if (err) {
                console.error('Error fetching user data:', err);
                if (err.code === grpc.status.NOT_FOUND) {
                    // User not found
                    res.status(404).send({ error: 'User not found' });
                } else {
                    // Other errors
                    next(err);
                }
                return;
            }
            console.log('User response:', userResponse);

            // Fetch posts data using gRPC call
            console.log(`Fetching posts data for userId: ${userId}`);
            postsStub.findPost({ userId: userId }, (err, postResponse) => {
                if (err) {
                    console.error('Error fetching posts data:', err);
                    res.status(400).send(err.details);
                    return;
                }
                console.log('Posts response:', postResponse);

                // Handle fetching subposts data for each post
                const postPromises = postResponse.posts.map(post => {
                    return new Promise((resolve, reject) => {
                        console.log(`Fetching subposts for postId: ${post.postId}`);
                        subpostsStub.findSubpost({ postId: post.postId }, (err, subpostResponse) => {
                            if (err) {
                                reject(err.details);
                            } else {
                                console.log(`Subposts response for postId: ${post.postId}:`, subpostResponse);
                                post.subpost = subpostResponse.subposts;  // Update subpost data in the post object
                                resolve();
                            }
                        });
                    });
                });

                // Wait for all promises to resolve
                Promise.all(postPromises)
                    .then(() => {
                        // Combine user, posts, and subposts data in the response
                        const response = {
                            user: userResponse,
                            posts: postResponse.posts.map(post => {
                                return {
                                    title: post.title,
                                    postId: post.postId,
                                    subpost: post.subpost // Include only the subpost field
                                };
                            })
                        };
                        console.log('Final response:', response);
                        res.send(response);
                    })
                    .catch(error => {
                        console.error('Error fetching subposts:', error);
                        res.status(400).send(error);
                    });
            });
        });
    } catch (error) {
        console.error('An error occurred while processing the request:', error);
        res.status(500).send('Internal Server Error');
    }
});
// POST API: Create new data for users, posts, and subposts
app.post('/users', (req, res) => {
    const { user, posts, subposts } = req.body;

    // Log the data being sent to the gRPC services
    console.log('Received user data:', user);
    console.log('Received posts data:', posts);
    console.log('Received subposts data:', subposts);

    // Add new user data using gRPC call
    usersStub.addUser(user, (err, userResponse) => {
        console.log(userResponse, 'userrrrrrrrrrrrr')
        if (err) {
            console.error('Error adding user:', err);
            res.status(400).send(err.details);
            return;
        }
        console.log('User added:', userResponse);

        // Handle post and subpost creation
        const createPostsAndSubposts = () => {
            const postPromises = posts.map(post => {
                // Include postId field when creating a new post
                const postData = {
                    title: post.title,
                    userId: userResponse.userId, // Use the userId returned from addUser
                    postId: post.postId // Add postId field
                };

                console.log(postData, 'post');

                return new Promise((resolve, reject) => {
                    // Add new post using gRPC call
                    postsStub.addPost(postData, (err, postResponse) => {
                        if (err) {
                            console.error('Error adding post:', err);
                            reject(err.details);
                        } else {
                            // Ensure that postId is retrieved correctly from the response object
                            const postId = postResponse.postId || postData.postId;

                            console.log('Post added:', postResponse);

                            // Add subposts related to the current post
                            const subpostPromises = subposts
                                .filter(subpost => subpost.postId === post.postId)
                                .map(subpost => {
                                    // Include subpostId field when creating a new subpost

                                    console.log(subpost, 'subbbbbbbbbbbbbbbp');
                                    const subpostData = {
                                        content: subpost.content,
                                        postId: subpost.postId, // Use postId returned from addPost
                                        subpostId: subpost.subpostId // Add subpostId field
                                    };

                                    console.log(subpostData.postId, 'subbbb');

                                    return new Promise((resolve, reject) => {
                                        // Add new subpost using gRPC call
                                        subpostsStub.addSubpost(subpostData, (err, subpostResponse) => {
                                            if (err) {
                                                console.error('Error adding subpost:', err);
                                                reject(err.details);
                                            } else {
                                                console.log(subpostData, 'subpostdatatat');
                                                console.log('Subpost added:', subpostResponse);
                                                resolve();
                                            }
                                        });
                                    });
                                });

                            // Wait for all subpost promises to resolve
                            Promise.all(subpostPromises)
                                .then(resolve)
                                .catch(reject);
                        }
                    });


                });
            });

            // Wait for all post promises to resolve
            Promise.all(postPromises)
                .then(() => {
                    console.log('All posts and subposts added successfully');
                    res.status(201).send(userResponse);
                })
                .catch(error => {
                    console.error('Error in adding posts and subposts:', error);
                    res.status(400).send(error);
                });
        };

        // Start creating posts and subposts
        createPostsAndSubposts();
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    res.status(500).send('Internal Server Error');
});

app.listen(restPort, () => {
    console.log(`RESTful API is listening on port ${restPort}`);
});
