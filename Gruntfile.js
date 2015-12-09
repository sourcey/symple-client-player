module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: {
            css: {
                src: [
                    'src/*.css'
                ],
                dest: 'dist/symple.player.css'
            },
            js: {
                src: [
                    'src/*.js'
                ],
                dest: 'dist/symple.player.js'
            }
        },
        cssmin: {
            css: {
                src: 'dist/symple.player.css',
                dest: 'dist/symple.player.min.css'
            }
        },
        uglify: {
            js: {
                files: {
                    'dist/symple.player.min.js': ['dist/symple.player.js']
                }
            }
        },
        watch: {
          files: ['*'],
          tasks: ['concat', 'cssmin', 'uglify']
       }
    });
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.registerTask('default', ['concat:css', 'cssmin:css', 'concat:js', 'uglify:js']);
};
