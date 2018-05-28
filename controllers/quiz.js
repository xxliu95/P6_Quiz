const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const {models} = require("../models");

const paginate = require('../helpers/paginate').paginate;

// Autoload the quiz with id equals to :quizId
exports.load = (req, res, next, quizId) => {

    models.quiz.findById(quizId, {
        include: [
            {model: models.tip,
                include:[{model: models.user, as:'tipAuthor'}]},
            {model: models.user, as: 'author'}
        ]
    })
        .then(quiz => {
            if (quiz) {
                req.quiz = quiz;
                next();
            } else {
                throw new Error('There is no quiz with id=' + quizId);
            }
        })
        .catch(error => next(error));
};


// MW that allows actions only if the user logged in is admin or is the author of the quiz.
exports.adminOrAuthorRequired = (req, res, next) => {

    const isAdmin  = !!req.session.user.isAdmin;
    const isAuthor = req.quiz.authorId === req.session.user.id;

    if (isAdmin || isAuthor) {
        next();
    } else {
        console.log('Prohibited operation: The logged in user is not the author of the quiz, nor an administrator.');
        res.send(403);
    }
};


// GET /quizzes
exports.index = (req, res, next) => {

    let countOptions = {
        where: {}
    };

    let title = "Questions";

    // Search:
    const search = req.query.search || '';
    if (search) {
        const search_like = "%" + search.replace(/ +/g,"%") + "%";

        countOptions.where.question = { [Op.like]: search_like };
    }

    // If there exists "req.user", then only the quizzes of that user are shown
    if (req.user) {
        countOptions.where.authorId = req.user.id;
        title = "Questions of " + req.user.username;
    }

    models.quiz.count(countOptions)
        .then(count => {

            // Pagination:

            const items_per_page = 10;

            // The page to show is given in the query
            const pageno = parseInt(req.query.pageno) || 1;

            // Create a String with the HTMl used to render the pagination buttons.
            // This String is added to a local variable of res, which is used into the application layout file.
            res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

            const findOptions = {
                ...countOptions,
                offset: items_per_page * (pageno - 1),
                limit: items_per_page,
                include: [{model: models.user, as: 'author'}]
            };

            return models.quiz.findAll(findOptions);
        })
        .then(quizzes => {
            res.render('quizzes/index.ejs', {
                quizzes,
                search,
                title
            });
        })
        .catch(error => next(error));
};


// GET /quizzes/:quizId
exports.show = (req, res, next) => {

    const {quiz} = req;

    res.render('quizzes/show', {quiz});
};


// GET /quizzes/new
exports.new = (req, res, next) => {

    const quiz = {
        question: "",
        answer: ""
    };

    res.render('quizzes/new', {quiz});
};

// POST /quizzes/create
exports.create = (req, res, next) => {

    const {question, answer} = req.body;

    const authorId = req.session.user && req.session.user.id || 0;

    const quiz = models.quiz.build({
        question,
        answer,
        authorId
    });

    req.session.toBeResolved = "";

    // Saves only the fields question and answer into the DDBB
    quiz.save({fields: ["question", "answer", "authorId"]})
        .then(quiz => {
            req.flash('success', 'Quiz created successfully.');
            res.redirect('/quizzes/' + quiz.id);
        })
        .catch(Sequelize.ValidationError, error => {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.render('quizzes/new', {quiz});
        })
        .catch(error => {
            req.flash('error', 'Error creating a new Quiz: ' + error.message);
            next(error);
        });
};


// GET /quizzes/:quizId/edit
exports.edit = (req, res, next) => {

    const {quiz} = req;

    res.render('quizzes/edit', {quiz});
};


// PUT /quizzes/:quizId
exports.update = (req, res, next) => {

    const {quiz, body} = req;

    quiz.question = body.question;
    quiz.answer = body.answer;

    quiz.save({fields: ["question", "answer"]})
        .then(quiz => {
            req.flash('success', 'Quiz edited successfully.');
            res.redirect('/quizzes/' + quiz.id);
        })
        .catch(Sequelize.ValidationError, error => {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.render('quizzes/edit', {quiz});
        })
        .catch(error => {
            req.flash('error', 'Error editing the Quiz: ' + error.message);
            next(error);
        });
};


// DELETE /quizzes/:quizId
exports.destroy = (req, res, next) => {

    req.quiz.destroy()
        .then(() => {
            req.flash('success', 'Quiz deleted successfully.');
            res.redirect('/goback');
        })
        .catch(error => {
            req.flash('error', 'Error deleting the Quiz: ' + error.message);
            next(error);
        });
};


// GET /quizzes/:quizId/play
exports.play = (req, res, next) => {

    const {quiz, query} = req;

    const answer = query.answer || '';

    res.render('quizzes/play', {
        quiz,
        answer
    });
};


// GET /quizzes/:quizId/check
exports.check = (req, res, next) => {

    const {quiz, query} = req;

    const answer = query.answer || "";
    const result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();

    res.render('quizzes/result', {
        quiz,
        result,
        answer
    });
};

// GET /quizzes/randomplay
exports.randomplay = (req, res, next) => {
    if(req.session.toBeResolved){
        renderQuiz(req, res, next);
    } else {
        req.session.toBeResolved = [];
        req.session.score = 0;
        let i = 0;
        models.quiz.findAll()
            .each(quiz => {
                req.session.toBeResolved[i] = quiz.id;
                i++;
            })
            .then(() => {
                renderQuiz(req, res, next);
            })
    }

}

// GET /quizzes/randomcheck/:quizId?answer=respuesta
exports.randomcheck = (req, res, next) => {
    const {quiz, query} = req;

    const answer = query.answer || "";
    const result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();

    if(result){
        req.session.toBeResolved.splice(req.session.num,1);
        req.session.score ++;
    }
    const score = req.session.score;

    if(req.session.toBeResolved.length === 0){
        req.session.score = 0;
        req.session.toBeResolved = "";
        res.render('quizzes/random_nomore', {
            score
        });
    }else{
        res.render('quizzes/random_result', {
            quiz,
            result,
            answer,
            score
        });
    }
}

renderQuiz = (req, res, next) => {
    req.session.num = Math.floor((Math.random() * req.session.toBeResolved.length));
    let id = req.session.toBeResolved[req.session.num];
    const query = req;
    const score = req.session.score;
    const answer = query.answer || '';
    models.quiz.findById(id)
        .then(quiz => {
            if (quiz) {
                res.render('quizzes/random_play',{
                    quiz,
                    answer,
                    score,
                });
            } else {
                res.render('quizzes/random_noquiz',{score:0})
                //throw new Error('There is no quizzes');
            }
        })
        .catch(error => next(error));
}