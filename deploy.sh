#!/bin/bash
set -e # exit with nonzero exit code if anything fails

REPO=`git config remote.origin.url`
SSH_REPO=${REPO/https:\/\/github.com\//git@github.com:}

# Run compile script
NODE_ENV=production gulp build

# Copy cname config
cp CNAME dist/

# Get the deploy key by using Travis's stored variables to decrypt github_deploy_key.enc
openssl aes-256-cbc \
         -K $encrypted_0b001862beca_key \
         -iv $encrypted_0b001862beca_iv \
         -in ".travis/github_deploy_key.enc" \
         -out github_deploy_key -d
chmod 600 github_deploy_key
eval `ssh-agent -s`
ssh-add github_deploy_key

# Go to the out directory and create a *new* Git repo
cd dist
git init

# inside this git repo we'll pretend to be a new user
git config user.name "Travis CI"
git config user.email "$GH_USER_EMAIL"

# The first and only commit to this new Git repo contains all the
# files present with the commit message "Deploy to GitHub Pages".
git add .
git commit -m "Deploy to GitHub Pages"

# Force push from the current repo's master branch to the remote
# repo's gh-pages branch. (All previous history on the gh-pages branch
# will be lost, since we are overwriting it.) We redirect any output to
# /dev/null to hide any sensitive credential data that might otherwise be exposed.
git push --force --quiet $SSH_REPO master:gh-pages > /dev/null 2>&1
