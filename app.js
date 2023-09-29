const cheerio = require('cheerio');
const axios = require('axios');
const mongoose = require('mongoose');
const { ProfilingLevel } = require('mongodb');
const postCode = require('./postcode');
const fs = require("fs");
const { parse } = require("csv-parse");

const postcodes = [];

fs.createReadStream("./postcodes.csv")
  .pipe(parse({ delimiter: ",", from_line: 2 }))
  .on("data", function (row) {
    postcodes.push(row[0]);
    //console.log(row);
  })
  .on("error", function (error) {
    console.log(error.message);
  })
  .on("end", function () {
    const main = async ()=>{
      console.log("postcodes:");
      console.log(postcodes);
       for(const postcode of postcodes){
        const results =  await postCode.ggs2(postcode);
      }
      
  }
  main();
  });


console.log('hi');
 