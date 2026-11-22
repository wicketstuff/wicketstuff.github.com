# The site is built with plain Jekyll, not the github-pages gem, so the
# plugins in _plugins/ run (the search index, see _plugins/search.rb).
# .github/workflows/pages.yml runs `bundle exec jekyll build`.
source "https://rubygems.org"
ruby RUBY_VERSION

gem "base64"
gem "csv"
gem "jekyll", "4.4.1"
gem "nokogiri"
gem "webrick"

group :jekyll_plugins do
  gem "jekyll-relative-links"
end
