const Sequelize = require("sequelize");
const {models} = require("../models");


// Autoload the tip with id equals to :tipId
exports.load = (req, res, next, tipId) => {

    models.tip.findById(tipId)
        .then(tip => {
            if (tip) {
                req.tip = tip;
                next();
            } else {
                next(new Error('There is no tip with tipId=' + tipId));
            }
        })
        .catch(error => next(error));
};


// POST /quizzes/:quizId/tips
exports.create = (req, res, next) => {

    const tip = models.tip.build(
        {
            text: req.body.text,
            quizId: req.quiz.id,
            authorId: req.session.user.id
        });

    tip.save({fields: ["text", "quizId", "authorId"]})
        .then(tip => {
            req.flash('success', 'Tip created successfully.');
            res.redirect("back");
        })
        .catch(Sequelize.ValidationError, error => {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.redirect("back");
        })
        .catch(error => {
            req.flash('error', 'Error creating the new tip: ' + error.message);
            next(error);
        });
};


// GET /quizzes/:quizId/tips/:tipId/accept
exports.accept = (req, res, next) => {

    const {tip} = req;

    tip.accepted = true;

    tip.save(["accepted"])
        .then(tip => {
            req.flash('success', 'Tip accepted successfully.');
            res.redirect('/quizzes/' + req.params.quizId);
        })
        .catch(error => {
            req.flash('error', 'Error accepting the tip: ' + error.message);
            next(error);
        });
};


// DELETE /quizzes/:quizId/tips/:tipId
exports.destroy = (req, res, next) => {

    req.tip.destroy()
        .then(() => {
            req.flash('success', 'tip deleted successfully.');
            res.redirect('/quizzes/' + req.params.quizId);
        })
        .catch(error => next(error));
};
