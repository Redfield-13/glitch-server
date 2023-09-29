const axios = require('axios');
const axiosRetry = require('axios-retry');
const FormData = require('form-data');
const randomUseragent = require('random-useragent');
const querystring = require("querystring");
const cheerio = require("cheerio");

// Retry 10 times, random time between retries (3-15 seconds)
axiosRetry(axios, { retries: 10, retryDelay: (retryCount) => {
        return (Math.random() * (15 - 3) + 3) * 1000; // * 1000 to get milliseconds
    }});

// Get fresh login token by doing a login request.
// Stores the value in global variable if not set already. If set already, return it without doing login.
async function get_cookie() {
    // Check if logged in already
    if (global.cookie !== undefined) {
        return global.cookie;
    }
    // Else do login
    const formData = new FormData();
    const login_url = 'https://www.tracegenie.com/amember4/amember/login';
    formData.append('amember_login', 'art2sl');
    formData.append('amember_pass', 'nHZpKtaQh7@@ZvW');
    formData.append('remember_login', 1);
    formData.append('login_attempt_id', Math.floor(+new Date() / 1000)); // Epoch timestamp
    formData.append('_referer', 'https://www.tracegenie.com/');
    const base_headers = {
        'Accept': 'application/json',
        'User-Agent': randomUseragent.getRandom(), // Use a random user-agent to make it more ... well random
    };

    const resp = await axios.post(
        login_url,
        formData,
        {headers: Object.assign({}, base_headers, formData.getHeaders())}
    );

    const cookies = resp.headers['set-cookie'];
    let cookie_str = '';
    for (let i=0;i<=3;i++) {
        if (cookies[i] !== undefined) {
            cookie_str += cookies[i].split(" ")[0];
        }
        
    }
    global.cookie = cookie_str;
    return cookie_str;
}

// Summons data from the magical (but slow!) genie of trace
async function genie_call(method, params) {
    const base = 'https://www.tracegenie.com';
    let url_path = ''

    // Set path based on the search method used
    if (method==='name_town') {
        url_path = '/amember4/amember/prov/allnt.php';
    }
    else if (method==='postcode') {
        url_path = '/amember4/amember/prov/allpc.php';
    }
    else if (method==='postcode_address') {
        url_path = '/amember4/amember/prov/address22promember.php';
    }
    else if (method==='occupants') {
        url_path = '/amember4/amember/prov/occs2.php';
    }
    else {
        // If using a unknown method, exit process to prevent issues further down
        console.log("Unknown method error.");
        process.exit(1);
    }

    // Construct the query parameter string
    let query_str = querystring.stringify(params);
    // Construct the final URL from all the components
    const url = `${base}${url_path}?${query_str}`;
    const urlResponse = await axios.get(url, {headers: {Cookie: await get_cookie()  }});
    urlResponse.data = urlResponse.data.replace(/&nbsp;/g, ' '); // &nbsp; to single space to fix whitespace
    urlResponse.data = urlResponse.data.replace(/\s{2,}/g, ' '); // Replace more than 1 space with 1 space

    return urlResponse
}

// Extracts info such as name, phone, address, etc from a table.
function process_table($item, $) {
    let result = {};
    result['name'] = $($item).find("div.c200>font>b").text().trim();
    result['phone'] = $($item).find("tr:nth-child(3) > td:nth-child(1) > b > font").text().trim();
    result['year_of_birth'] = $($item).find("b:nth-child(4) > a > span").text();
    // Extract year of birth from the string
    if (result['year_of_birth']) {
        result['year_of_birth'] = result['year_of_birth'].substring(
            result['year_of_birth'].indexOf(":")+1,
            result['year_of_birth'].lastIndexOf("TPS:")
        )
    }
    // If specified, get DOB
    result['DOB'] = $($item).find("tr:nth-child(2) > td:nth-child(1) > font > b:nth-child(6)").text().replace("DOB:", "").trim();

    // Parse the address into components and then extract if OK.
    const address_components = $($item).find("tr:nth-child(2) > td:nth-child(1) > font > b:nth-child(1)").html().split("<br>");
    if (address_components.length === 3) {
        result['town'] = address_components[1];
        result['postcode'] = address_components[2].trim();
        result['address'] = address_components[0];
        //console.log(address_components);
    }
    else {
        console.log("Address components missing?");
        result['town'] = address_components[5];
        result['postcode'] = address_components[6];
        result['address'] = address_components[1] +' '+ address_components[2];
        console.log(address_components);
    }

    return result;
}

async function get_occupants(result) {
    const urlResponse = await genie_call("occupants", {
        q52o: result['address'],
        q322o: result['postcode']
    });
    const $ = cheerio.load(urlResponse.data);

    const $years = $("font[color]");
    let occupants = {};
    for (const $year of $years) {
        const occupants_this_year = $($year.nextSibling).find("> b").text().slice(0, -1).split(",")
        if (occupants_this_year[0]) {
            occupants[$($year).text().trim()] = occupants_this_year;
        } else {
            occupants[$($year).text().trim()] = [];
        }
    }
    result['occupants'] = occupants;
    console.log(`Fetched occupants for ${result['address']}`)
    return occupants;

}

async function process_items(items, $) {
    let results = [];
    for(const $item of items) { // Loop over all tables.
        // Get all the info from the table row
        let result = process_table($item, $);
        results.push(result);
    }

    console.log(`${results.length} results fetched`)

    // Make get_occupants promise (unresolved async call) for each result
    let occupant_promises = []
    for (let result of results) {
        occupant_promises.push(get_occupants(result))
    }
    // Do all the requests for occupants at once (async)
    await Promise.all(occupant_promises)

    // Save to DB here
    for (const result of results){
        console.log(result.name)
        console.log(result.phone)
        console.log(result.year_of_birth)
        console.log(result.town)
        console.log(result.postcode)
        console.log(result.address)
    }
    return results;

}

module.exports = {genie_call, process_items}