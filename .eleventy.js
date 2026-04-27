module.exports = function(eleventyConfig) {

  // Pass through static files unchanged
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy({"*.html": "."});
  eleventyConfig.addPassthroughCopy({"src/c3logo.png": "c3logo.png"});
  eleventyConfig.addPassthroughCopy({"sitemap.xml": "sitemap.xml"});
  eleventyConfig.addPassthroughCopy({"ev-calculator": "ev-calculator"});
  eleventyConfig.addPassthroughCopy({"netlify": "netlify"});
  eleventyConfig.addPassthroughCopy({"netlify.toml": "netlify.toml"});

  // Auto-collect all posts tagged "post"
  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: data => data.permalink || `/blog/${data.page.fileSlug.replace(/^p\d+-/, '')}/`
  });
  eleventyConfig.addCollection("post", function(collectionApi) {
    return collectionApi.getFilteredByTag("post").sort((a, b) => b.date - a.date);
  });

  // Date filter: "3 April 2026"
  eleventyConfig.addFilter("dateDisplay", (dateObj) => {
    return new Date(dateObj).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  });

  // ISO date for <time datetime="">
  eleventyConfig.addFilter("dateISO", (dateObj) => {
    return new Date(dateObj).toISOString().split("T")[0];
  });

  // Maps category slug to CSS class
  eleventyConfig.addFilter("tagClass", (category) => {
    const map = {
      "buying-guides":"tag-guide","value-and-worth":"tag-guide",
      "product-comparisons":"tag-guide","selling-and-money":"tag-guide",
      "beginner-guides":"tag-game","general-tcg":"tag-game",
      "tools-and-trackers":"tag-tools","accessories":"tag-accessory"
    };
    return map[category] || "tag-guide";
  });

  // Maps category slug to display label
  eleventyConfig.addFilter("tagLabel", (category) => {
    const map = {
      "buying-guides":"Buying Guide","value-and-worth":"Buying Guide",
      "product-comparisons":"Buying Guide","selling-and-money":"Selling Guide",
      "beginner-guides":"Game Guide","general-tcg":"Game Guide",
      "tools-and-trackers":"Free Tools","accessories":"Accessories"
    };
    return map[category] || "Guide";
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_includes/layouts"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};