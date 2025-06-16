

const normalizeUser = (user) => {
    if (!user) return null;

    // Convert to plain object if it's a Mongoose document
    const userObj = user.toObject ? user.toObject() : {...user};

    // Remove sensitive data
    delete userObj.password;

    // Ensure ID field is consistent (use id instead of _id)
    if (userObj._id && !userObj.id) {
        userObj.id = userObj._id.toString();
    } else if (userObj._id) {
        userObj.id = userObj.id.toString();
    }

    // Ensure basic user fields exist to prevent client errors
    return {
        id: userObj.id || '',
        _id: userObj.id || userObj._id || '', // For backward compatibility
        firstName: userObj.firstName || '',
        lastName1: userObj.lastName1 || '',
        lastName2: userObj.lastName2 || '',
        email: userObj.email || '',
        appName: userObj.appName || '',
        avatar: userObj.avatar || '',
        role: userObj.role || 'client',
        ...userObj
    };
};

module.exports = {
    normalizeUser
};