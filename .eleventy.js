module.exports = function(eleventyConfig) {

  // Pass through static files unchanged
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
eleventyConfig.addPassthroughCopy({"*.html": "."});
eleventyConfig.addPassthroughCopy({"c3-logo.png": "c3-logo.png"});
eleventyConfig.addPassthroughCopy({"sitemap.xml": "sitemap.xml"});

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
    const map = { guide:"tag-guide", review:"tag-review", game:"tag-game", accessory:"tag-accessory" };
    return map[category] || "tag-guide";
  });

  // Maps category slug to display label
  eleventyConfig.addFilter("tagLabel", (category) => {
    const map = { guide:"Buying Guide", review:"Set Review", game:"Game Guide", accessory:"Accessories" };
    return map[category] || "Guide";
  });

  return {
    dir: {
      input:    "src",
      output:   "_site",
      includes: "_includes",
      layouts:  "_includes/layouts"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
