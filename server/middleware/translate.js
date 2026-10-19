// Express Middleware Example
const express = require('express');
const axios = require('axios');

async function detectUserLocale(req, res, next) {
  // 1. Check if user manually picked a language in cookies
  let lang = req.cookies.preferred_lang;

  if (!lang) {
    // 2. Fallback to Accept-Language header
    const acceptLang = req.headers['accept-language'];
    if (acceptLang) {
      lang = acceptLang.split(',')[0].split('-')[0]; // e.g., 'es', 'fr', 'en'
    }

    // 3. Fallback to Geo-IP Lookup if needed
    try {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const geoRes = await axios.get(`https://ipapi.co/${clientIp}/json/`);
      if (geoRes.data?.languages) {
        lang = geoRes.data.languages.split(',')[0].substring(0, 2);
      }
    } catch (err) {
      lang = 'en'; // Default fallback
    }
  }

  req.locale = lang;
  next();
}