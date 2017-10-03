var gulp        = require('gulp');
var useref      = require('gulp-useref');
var sass        = require('gulp-sass');
var autoprefixer = require('gulp-autoprefixer');
var uglify      = require('gulp-uglify');
var cssnano     = require('gulp-cssnano');
var gulpIf      = require('gulp-if');
var imagemin    = require('gulp-imagemin');
var cache       = require('gulp-cache');
var sourcemaps = require('gulp-sourcemaps');
var browserSync = require('browser-sync');
var runSequence = require('run-sequence');
var del         = require('del');
var gulpUtil = require('gulp-util');

var production = process.env.NODE_ENV === 'production';

/* Development Tasks */

// Start browserSync server
gulp.task('browserSync', function() {
  browserSync({
    proxy: "localhost:8000",
    serveStatic: ['.', './app']
  })
})

gulp.task('sass', function() {
  return gulp.src('app/scss/**/*.scss')
    .pipe(sass())
    .pipe(autoprefixer())
    .pipe(gulp.dest('app/css'))
    .pipe(browserSync.reload({
      stream: true
    }))
    .on('error', console.error.bind(console));
})

// Watchers
gulp.task('watch', function() {
  gulp.watch('app/scss/**/*.scss', ['sass']);
  gulp.watch('app/*.html', browserSync.reload);
  gulp.watch('app/js/**/*.js', browserSync.reload);
})

/* Optimization Tasks */

// Optimize js and css
gulp.task('useref', function() {
  return gulp.src('app/*.html')
    .pipe(useref())
    .pipe(gulpIf('*.js', uglify().on('error', gulpUtil.log)))
    .pipe(gulpIf('*.css', cssnano()))
    .pipe(gulp.dest('dist'));
});

// Optimize images
gulp.task('images', function() {
  return gulp.src('app/images/**/*.+(png|jpg|jpeg|gif|svg)')
    // Caching images that ran through imagemin
    .pipe(cache(imagemin({
      interlaced: true,
    })))
    .pipe(gulp.dest('dist/images'))
});

// Copy fonts 
gulp.task('fonts', function() {
  return gulp.src('app/fonts/**/*')
    .pipe(gulp.dest('dist/fonts'))
})

// Copy favicon 
gulp.task('favicon', function() {
  return gulp.src('app/favicon.ico')
    .pipe(gulp.dest('dist'))
})

// Clean caches
gulp.task('clean:cache', function (callback) {
return cache.clearAll(callback)
})

// Clean dist, but leave the images
gulp.task('clean:dist', function() {
  return del.sync(['dist/**/*', '!dist/images', '!dist/images/**/*']);
});

/* Build Sequences */

// Default build task
gulp.task('default', function(callback) {
  runSequence(['sass', 'browserSync', 'watch'],
    callback
  )
})

// Build dist
gulp.task('build', function(callback) {
  runSequence(
    'clean:dist',
    ['sass', 'useref', 'images', 'fonts', 'favicon'],
    callback
  )
})