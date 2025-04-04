document.addEventListener("DOMContentLoaded", function() {
    var options = {
        valueNames: ['name', 'email'],
        item: '<li><h4 class="name"></h4><p class="email"></p></li>'
    };

    var userData = [
        { name: 'Jane Doe', email: 'jane.doe@example.com' },
        { name: 'John Doe', email: 'john.doe@example.com' }
    ];

    var userList = new List('user-list', options, userData);
});
