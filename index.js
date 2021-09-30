const SUP_LANGS = [
    "af",
    "al",
    "ar",
    "az",
    "bg",
    "ca",
    "cz",
    "da",
    "de",
    "el",
    "en",
    "eu",
    "fa",
    "fi",
    "fr",
    "gl",
    "he",
    "hi",
    "hr",
    "hu",
    "id",
    "it",
    "ja",
    "kr",
    "la",
    "lt",
    "mk",
    "no",
    "nl",
    "pl",
    "pt",
    "pt_br",
    "ro",
    "ru",
    "sv",
    "se",
    "sk",
    "sl",
    "sp",
    "es",
    "sr",
    "th",
    "tr",
    "ua",
    "uk",
    "vi",
    "zh_cn",
    "zh_tw",
    "zu"
],
    SUP_UNITS = ["standard", "metric", "imperial"]

const API_ENDPOINT = "https://api.openweathermap.org/",
    GEO_PATH = "geo/1.0/",
    DATA_PATH = "data/2.5/onecall"

const axios = require("axios").default,
    _ = require("lodash")

const currentFormatter = require("./formaters/current-formatter"),
    minutelyFormatter = require("./formaters/minutely-formatter"),
    hourlyFormatter = require("./formaters/hourly-formatter"),
    dailyFormatter = require("./formaters/daily-formatter")

class OpenWeatherAPI {

    #globalOptions = {
        key: undefined,
        lang: undefined,
        units: undefined,
        coordinates: {
            lat: undefined,
            lon: undefined
        },
        locationName: undefined
    }

    /**
     * Constructor of the class. You can specify global options here
     * 
     * @constructor
     * @param {Object} globalOptions - object that defines global options
     * @returns OpenWeatherAPI object
     */
    constructor(globalOptions = {}) {
        if (
            !(typeof globalOptions === "object") ||
            Array.isArray(globalOptions) ||
            globalOptions === null
        ) throw new Error("Provide {} object as options")
        for (const key in globalOptions) {
            if (Object.hasOwnProperty.call(globalOptions, key)) {
                const value = globalOptions[key]
                switch (key) {
                    case "key":
                        this.setKey(value)
                        break

                    case "language":
                        this.setLanguage(value)
                        break

                    case "units":
                        this.setUnits(value)
                        break

                    case "locationName":
                        this.setLocationByName(value)
                        break

                    case "coordinates":
                        this.setLocationByCoordinates(value.lat, value.lon)
                        break

                    default:
                        throw new Error("Unknown parameter: " + key)
                }
            }
        }
    }

    // setters and getters

    /**
     * Getter for global options
     * 
     * @returns {Object} global options
     */
    getGlobalOptions() {
        return this.#globalOptions
    }

    /**
     * Sets global API key
     * 
     * @param {String} key 
     */
    setKey(key) {
        if (!key) throw new Error("Empty value cannot be a key: " + key)
        this.#globalOptions.key = key
    }

    /**
     * Getter for global key
     * 
     * @returns global API key
     */
    getKey() {
        return this.#globalOptions.key
    }

    /**
     * Sets global language (Language must be listed [here](https://openweathermap.org/current#multi))
     * 
     * @param {String} lang - language
     */
    setLanguage(lang) {
        this.#globalOptions.lang = this.#evaluateLanguage(lang)
    }

    /**
     * Getter for global language
     * 
     * @returns global language
     */
    getLanguage() {
        return this.#globalOptions.lang
    }

    #evaluateLanguage(lang) {
        lang = lang.toLowerCase()
        if (SUP_LANGS.includes(lang))
            return lang
        else
            throw new Error("Unsupported language: " + lang)
    }

    /**
     * Sets global units
     * 
     * @param {String} units - units (Only **standard**, **metric** or **imperial** are supported)
     */
    setUnits(units) {
        this.#globalOptions.units = this.#evaluateUnits(units)
    }

    /**
     * Getter for global units
     * 
     * @returns global units
     */
    getUnits() {
        return this.#globalOptions.units
    }

    #evaluateUnits(units) {
        units = units.toLowerCase()
        if (SUP_UNITS.includes(units))
            return units
        else
            throw new Error("Unsupported units: " + units)
    }

    /**
     * Sets global location by provided name
     * 
     * @param {String} name - name of the location
     */
    setLocationByName(name) { // - location setter
        if (!name) throw new Error("Empty value cannot be a location name: " + name)
        this.#globalOptions.coordinates.lat = undefined
        this.#globalOptions.coordinates.lon = undefined
        this.#globalOptions.locationName = name
    }

    async #evaluateLocationByName(name) {
        let response = await this.#fetch(`${API_ENDPOINT}${GEO_PATH}direct?q=${name}&limit=1&appid=${this.#globalOptions.key}`)
        let data = response.data
        if (data.length == 0) throw new Error("Unknown location name: " + name)
        data = response.data[0]
        return {
            lat: data.lat,
            lon: data.lon
        }
    }

    /**
     * Sets global location by provided coordinates
     * 
     * @param {Number} lat - latitude of the location
     * @param {Number} lon - longitude of the location
     */
    setLocationByCoordinates(lat, lon) { // - location setter
        let location = this.#evaluateLocationByCoordinates(lat, lon)
        this.#globalOptions.coordinates.lat = location.lat
        this.#globalOptions.coordinates.lon = location.lon
        this.#globalOptions.locationName = undefined
    }

    #evaluateLocationByCoordinates(lat, lon) {
        if (typeof lat === "number" && typeof lon === "number" && -90 <= lat && lat <= 90 && -180 <= lon && lon <= 180) {
            return { lat: lat, lon: lon }
        } else {
            throw new Error("Wrong coordinates")
        }
    }

    /**
     * Getter for location
     * 
     * @param {Object} options - options used only for this call
     * @returns location
     */
    async getLocation(options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(`${API_ENDPOINT}${GEO_PATH}reverse?lat=${options.coordinates.lat}&lon=${options.coordinates.lon}&limit=1&appid=${options.key}`)
        let data = response.data
        return data.length ? data[0] : null
    }

    // Weather getters

    /**
     * Getter for current weather
     * 
     * @param {Object} options - options used only for this call
     * @returns weather object of current weather
     */
    async getCurrent(options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(this.#createURL(options, "alerts,minutely,hourly,daily"))
        let data = response.data
        return currentFormatter(data)
    }

    /**
     * Getter for minutely weather
     * 
     * @param {Number} limit - maximum length of returned array
     * @param {Object} options - options used only for this call
     * @returns array of Weather objects, one for every next minute (Empty if API returned no info about minutely weather)
     */
    async getMinutelyForecast(limit = Number.POSITIVE_INFINITY, options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(this.#createURL(options, "alerts,current,hourly,daily"))
        let data = response.data
        return minutelyFormatter(data, limit)
    }

    /**
     * Getter for hourly weather
     * 
     * @param {Number} limit - maximum length of returned array
     * @param {Object} options - options used only for this call
     * @returns array of Weather objects, one for every next hour (Empty if API returned no info about hourly weather)
     */
    async getHourlyForecast(limit = Number.POSITIVE_INFINITY, options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(this.#createURL(options, "alerts,current,minutely,daily"))
        let data = response.data
        return hourlyFormatter(data, limit)
    }

    /**
     * 
     * @param {Number} limit - maximum length of returned array
     * @param {Boolean} includeToday - boolean indicating whether to include today's weather in returned array
     * @param {Object} options - options used only for this call 
     * @returns array of Weather objects, one for every next day (Empty if API returned no info about daily weather)
     */
    async getDailyForecast(limit = Number.POSITIVE_INFINITY, includeToday = false, options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(this.#createURL(options, "alerts,current,minutely,hourly"))
        let data = response.data
        if (!includeToday)
            data.daily.shift()
        return dailyFormatter(data, limit)
    }

    /**
     * Getter for today's weather
     * 
     * @param {Object} options - options used only for this call 
     * @returns weather object of today's weather **NOT the same as current!**
     */
    async getToday(options = {}) {
        return (await this.getDailyForecast(1, true, options))[0]
    }

    /**
     * Getter for alerts
     * 
     * @param {Object} options - options used only for this call
     * @returns alerts (undefined if API returned no info about alerts)
     */
    async getAlerts(options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(this.#createURL(options, "current,minutely,hourly,daily"))
        let data = response.data
        return data.alerts
    }

    /**
     * Getter for every type of weather call and alerts
     * 
     * @param {Object} options - options used only for this call
     * @returns object that contains everything
     */
    async getEverything(options = {}) {
        await this.#uncacheLocation()
        options = await this.#formatOptions(options)
        let response = await this.#fetch(this.#createURL(options))
        let data = response.data
        return {
            lat: data.lat,
            lon: data.lon,
            timezone: data.timezone,
            timezone_offset: data.timezone_offset,
            current: currentFormatter(data),
            minutely: minutelyFormatter(data, Number.POSITIVE_INFINITY),
            hourly: hourlyFormatter(data, Number.POSITIVE_INFINITY),
            daily: dailyFormatter(data, Number.POSITIVE_INFINITY),
            alerts: data.alerts
        }
    }

    // Uncategorized Methods

    /**
     * Merges weather objects
     * 
     * @param {Array} weathers - array of weather objects that you want to merge
     * @returns merged object of weather provided in weathers parameter
     */
    mergeWeathers(weathers) {
        if (!Array.isArray(weathers)) throw new Error("Provide list of weather objects")
        weathers.reverse()
        return _.merge({}, ...weathers)
    }

    // helpers
    async #uncacheLocation() {
        if (this.#globalOptions.coordinates.lat && this.#globalOptions.coordinates.lon) return
        if (this.#globalOptions.locationName) {
            this.#globalOptions.coordinates = await this.#evaluateLocationByName(this.#globalOptions.locationName)
        }
    }

    #createURL(options, exclude) {
        let url = new URL(DATA_PATH, API_ENDPOINT)
        url.searchParams.append("appid", options.key)
        url.searchParams.append("lat", this.#globalOptions.coordinates.lat)
        url.searchParams.append("lon", this.#globalOptions.coordinates.lon)
        if (options.lang)
            url.searchParams.append("lang", options.lang)
        if (options.units)
            url.searchParams.append("units", options.units)
        if (exclude)
            url.searchParams.append("exclude", exclude)
        return url.href
    }

    async #fetch(url) {
        //console.log("fetching:", url) // ! delete this
        let response
        try {
            response = await axios.get(url)
        } catch (error) {
            response = error.response
        }
        let data = response.data
        if (data.cod) {
            throw new Error(JSON.stringify(data))
        } else {
            return response
        }
    }

    async #formatOptions(options) {
        if (
            !(typeof options === "object") ||
            Array.isArray(options) ||
            options === null
        ) throw new Error("Provide {} object as options")
        for (const key in options) {
            if (Object.hasOwnProperty.call(options, key)) {
                const value = options[key]
                switch (key) {
                    case "key":
                        options.key = value
                        break

                    case "language":
                        options.lang = this.#evaluateLanguage(value)
                        break

                    case "units":
                        options.units = this.#evaluateUnits(value)
                        break

                    case "locationName":
                        options.coordinates = await this.#evaluateLocationByName(value)
                        break

                    case "coordinates":
                        options.coordinates = this.#evaluateLocationByCoordinates(value.lat, value.lon)
                        break

                    default:
                        throw new Error("Unknown parameter: " + key)
                }
            }
        }
        return _.merge({}, this.#globalOptions, options)
    }
}

module.exports = OpenWeatherAPI
