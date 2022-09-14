const response = require('../helpers/response')
const createErrors = require('http-errors')
const argon2 = require('argon2')
const jwt = require('jsonwebtoken')
const Duration = require('duration-js')
require('dotenv').config()
const {
  JWT_SECRET_KEY,
  JWT_TOKEN_LIFE,
  JWT_REFRESH_SECRET_KEY,
  JWT_REFRESH_TOKEN_LIFE,
  JWT_ALGORITHM,
  NODE_ENV
} = process.env
const { encrypt } = require('../helpers/cryptography')
const knex = require('../config/knex')

module.exports = {
  registerControllers: async (req, res) => {
    try {
      const data = req.body
      const bodyLength = Object.keys(data).length
      const user = await knex.select('name').from('users').where('email', data.email).first()
      let result = ''

      if (!bodyLength) throw new createErrors.BadRequest('Request body empty!')
      if (user) throw new createErrors.Conflict('Account has been registered!')

      const hashPassword = await argon2.hash(data.password, { type: argon2.argon2id })

      if (data?.role) {
        result = await knex('users').insert({
          name: data.name,
          email: data.email,
          password: hashPassword,
          role: data.role
        }).returning('name')
      } else {
        result = await knex('users').insert({
          name: data.name,
          email: data.email,
          password: hashPassword
        }).returning('name')
      }

      if (!result) throw new createErrors.NotImplemented('Registration failed!')

      result = {
        message: `${result[0].name} successfully registered!`
      }

      return response(res, 201, result)
    } catch (error) {
      return response(res, error.status || 500, {
        message: error.message || error
      })
    }
  },
  loginControllers: async (req, res) => {
    try {
      const data = req.body
      const bodyLength = Object.keys(data).length
      const user = await knex.select('*').from('users').where('email', data.email).first()
      const sessionToken = req.signedCookies?.token

      if (!bodyLength) throw new createErrors.BadRequest('Request body empty!')
      if (!user) throw new createErrors.ExpectationFailed('Unregistered account!')
      if (sessionToken) throw new createErrors.UnprocessableEntity('Session still active, you need to log out!')

      const verifyPassword = await argon2.verify(user.password, data.password)

      delete user.password

      if (!verifyPassword) throw new createErrors.NotAcceptable('Password did not match!')

      const dataToSign = { email: user.email }
      const accessToken = jwt.sign(dataToSign, JWT_SECRET_KEY, {
        algorithm: JWT_ALGORITHM,
        expiresIn: JWT_TOKEN_LIFE
      })
      const refreshToken = jwt.sign(dataToSign, JWT_REFRESH_SECRET_KEY, {
        algorithm: JWT_ALGORITHM,
        expiresIn: JWT_REFRESH_TOKEN_LIFE
      })
      const encryptedCookieContent = await encrypt(13, refreshToken)
      const maxAgeCookie = new Duration(JWT_REFRESH_TOKEN_LIFE)

      res.cookie('token', encryptedCookieContent, {
        maxAge: maxAgeCookie,
        expires: maxAgeCookie + Date.now(),
        httpOnly: true,
        sameSite: 'strict',
        secure: NODE_ENV === 'production',
        signed: true
      })

      const addedRefreshToken = await knex('users').where('email', user.email).update('refresh_token', refreshToken).returning('name')

      if (!addedRefreshToken) throw new createErrors.NotAcceptable('Failed to adding refresh token!')

      const userCurrentRecipes = await knex.select('*').from('recipes')
        .leftJoin('users', 'recipes.creator_id', 'users.id')
        .leftJoin('likers', 'recipes.liker_id', 'likers.id')
        .leftJoin('conservators', 'recipes.conservator_id', 'conservators.id')
        .leftJoin('videos', 'recipes.video_id', 'videos.id')
        .where('recipes.creator_id', user.id)

      console.log('resepnya', userCurrentRecipes)

      delete user.refresh_token

      const users = {
        ...user,
        accessToken,
        recipes: userCurrentRecipes
      }

      return response(res, 202, users)
    } catch (error) {
      return response(res, error.status || 500, {
        message: error.message || error
      })
    }
  },
  refreshTokenControllers: async (req, res) => {
    try {
      const data = req.data

      if (!data) throw new createErrors.NotExtended('Session not found!')

      const user = await knex.select('email').from('users').where('email', data.email).first()

      if (!user) throw new createErrors.ExpectationFailed('Unregistered account!')

      const dataToSign = { email: user.email }
      const accessToken = jwt.sign(dataToSign, JWT_SECRET_KEY, {
        algorithm: JWT_ALGORITHM,
        expiresIn: JWT_TOKEN_LIFE
      })

      return response(res, 200, { token: accessToken })
    } catch (error) {
      return response(res, error.status || 500, {
        message: error.message || error
      })
    }
  },
  logoutControllers: async (req, res) => {
    try {
      const user = req.userData

      console.log(user)

      if (!user) throw new createErrors.NotExtended('Session not found!')

      const removeRefreshToken = await knex('users').where('email', user.email).update('refresh_token', '').returning('name')

      if (!removeRefreshToken) throw new createErrors.NotAcceptable('Failed to remove refresh token!')

      res.clearCookie('token')

      return response(res, 200, {
        message: 'Successfully log out'
      })
    } catch (error) {
      return response(res, error.status || 500, {
        message: error.message || error
      })
    }
  }
}
