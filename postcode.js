const cheerio = require('cheerio');
const fs = require('fs');
const lib = require('./lib');
const { genie_call } = require('./lib');

async function ggs2(postCode) {
  try {
    // Get first page
    const urlResponse = await lib.genie_call('postcode', {
      q6: postCode,
      s: 0,
    });

    // Process first page
    const $ = cheerio.load(urlResponse.data);
    const items = $('div.CSSTableGenerator');
    let first_page_results = await lib.process_items(items, $);

    // Send first page of results to the frontend
    for (const result of first_page_results) {
      fs.appendFile('Results.txt', JSON.stringify(result) + '\r\n', (err) => {
        if (err) {
          console.error('Error saving file:', err);
        } else {
          console.log('Saved!');
        }
      });
    }

    // Get total number of results
    const results_str = $("a ~ font > b");
    let total_pages = 0;

    if (results_str.length !== 0) {
      const total_results = results_str.text().split('of ')[1].split(' ')[0];
      total_pages = Math.ceil(total_results / 10);
      console.log(total_pages);
    } else {
      return first_page_results;
    }

    // Construct requests to get all the other pages
    let requests = [];
    for (let i = 1; i <= total_pages - 1; i++) {
      requests.push(
        lib.genie_call('postcode', {
          q6: postCode,
          s: i * 10,
        })
      );
    }

    // Do all the requests at once
    const pageUrlResponses = await Promise.all(requests);

    // Load the page HTML and create processing tasks
    const process_tasks = pageUrlResponses.map((urlResponse) => {
      const $ = cheerio.load(urlResponse.data);
      const items = $('div.CSSTableGenerator');
      return lib.process_items(items, $);
    });

    // Process (get occupancy data) the results all at once
    const results = await Promise.all(process_tasks);
    const all_results = [].concat(...results);
    console.log('Length: ' + all_results.length);

    for (const result of all_results) {
      fs.appendFile('Results.txt', JSON.stringify(result) + '\r\n', (err) => {
        if (err) {
          console.error('Error saving file:', err);
        } else {
          console.log('Saved!');
        }
      });
    }

    console.log('Done!');
    return first_page_results.concat(all_results);
  } catch (err) {
    console.error('Error:', err);
    return [];
  }
}

module.exports = {
  ggs2,
};