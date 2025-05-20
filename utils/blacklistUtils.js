const revokedTokens = [];
const addToBlacklist = (token) => {
revokedTokens.push(token);
};
const isTokenRevoked = (token) => {
return revokedTokens.includes(token);
};
module.exports = {
addToBlacklist,
isTokenRevoked
};